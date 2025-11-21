import { Injectable, Logger } from '@nestjs/common';
import { 
  OnGatewayConnection, 
  OnGatewayDisconnect, 
  WebSocketGateway, 
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {
  MarketPriceData,
  MarketSnapshot,
  MarketAnalysis,
  MarketForecast,
  PriceBroadcastMessage,
  MarketUpdateSubscription,
  PriceAlert,
  MarketEventType
} from './price-system.interface';

/**
 * Price Broadcasting Service
 * ระบบส่งข้อมูลราคาและการวิเคราะห์ตลาดแบบ Real-time
 * 
 * ความรับผิดชอบหลัก:
 * 1. WebSocket Broadcasting ข้อมูลราคาให้ผู้เล่น
 * 2. Subscription Management สำหรับ Market Updates
 * 3. Price Alert System เมื่อราคาเปลี่ยนแปลงมาก
 * 4. Market Dashboard Data Broadcasting
 * 
 * WebSocket Events:
 * - price_update: ราคาเปลี่ยนแปลง
 * - market_analysis: การวิเคราะห์ตลาด
 * - market_forecast: การทำนายราคา
 * - price_alert: แจ้งเตือนราคา
 * - market_snapshot: ภาพรวมตลาด
 */
@Injectable()
@WebSocketGateway({
  namespace: '/market',
  cors: {
    origin: '*',
    credentials: true
  }
})
export class PriceBroadcastingService implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(PriceBroadcastingService.name);
  
  @WebSocketServer()
  server!: Server;

  // Session และ User subscriptions
  private readonly sessionRooms: Map<number, Set<string>> = new Map(); // sessionId -> Set<socketId>
  private readonly userSessions: Map<string, number> = new Map(); // socketId -> sessionId
  private readonly subscriptions: Map<string, MarketUpdateSubscription> = new Map(); // socketId -> subscription
  private readonly priceAlerts: Map<string, PriceAlert[]> = new Map(); // socketId -> alerts[]

  // Configuration
  private readonly config = {
    broadcastInterval: 1000, // 1 second update interval
    maxAlertsPerUser: 20,
    alertPriceThreshold: 0.05, // 5% price change
    dashboardUpdateInterval: 5000, // 5 seconds
    connectionTimeout: 30000 // 30 seconds
  };

  constructor() {
    this.logger.log('📡 Price Broadcasting Service initialized');
    this.initializeBroadcastingEngine();
  }

  // ========================================
  //  WebSocket Connection Management
  // ========================================

  async handleConnection(client: Socket): Promise<void> {
    try {
      const sessionId = this.extractSessionId(client);
      if (!sessionId) {
        this.logger.warn(`❌ Invalid session for client ${client.id}`);
        client.disconnect();
        return;
      }

      // เพิ่มเข้า session room
      if (!this.sessionRooms.has(sessionId)) {
        this.sessionRooms.set(sessionId, new Set());
      }
      this.sessionRooms.get(sessionId)!.add(client.id);
      this.userSessions.set(client.id, sessionId);

      // Join session room
      client.join(`session_${sessionId}`);
      
      // Initialize subscription
      this.subscriptions.set(client.id, {
        socketId: client.id,
        sessionId,
        subscribedAssets: new Set(),
        updateFrequency: 'normal',
        includeAnalysis: true,
        includeForecast: false,
        lastUpdate: new Date()
      });

      this.logger.log(`📱 Client ${client.id} connected to session ${sessionId}`);

      // ส่งข้อมูลเริ่มต้น
      await this.sendInitialMarketData(client, sessionId);

      // Setup message handlers
      this.setupMessageHandlers(client);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Connection error: ${errorMessage}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket): Promise<void> {
    try {
      const sessionId = this.userSessions.get(client.id);
      
      if (sessionId) {
        // ลบออกจาก session room
        const sessionClients = this.sessionRooms.get(sessionId);
        if (sessionClients) {
          sessionClients.delete(client.id);
          if (sessionClients.size === 0) {
            this.sessionRooms.delete(sessionId);
          }
        }
      }

      // ลบ subscriptions และ alerts
      this.userSessions.delete(client.id);
      this.subscriptions.delete(client.id);
      this.priceAlerts.delete(client.id);

      this.logger.log(`📱 Client ${client.id} disconnected from session ${sessionId}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Disconnect error: ${errorMessage}`);
    }
  }

  // ========================================
  //  Message Handlers Setup
  // ========================================

  private setupMessageHandlers(client: Socket): void {
    // Asset subscription
    client.on('subscribe_to_asset', async (data: { assetId: number; updateFrequency?: 'high' | 'normal' | 'low' }) => {
      await this.handleAssetSubscription(client, data);
    });

    // Asset unsubscription
    client.on('unsubscribe_from_asset', async (data: { assetId: number }) => {
      await this.handleAssetUnsubscription(client, data);
    });

    // Price alert setup
    client.on('setup_price_alert', async (alertData: {
      assetId: number;
      type: 'above' | 'below' | 'change_percent';
      threshold: number;
      enabled: boolean;
    }) => {
      await this.handlePriceAlert(client, alertData);
    });
  }

  // ========================================
  //  Subscription Management
  // ========================================

  async handleAssetSubscription(
    client: Socket,
    data: { assetId: number; updateFrequency?: 'high' | 'normal' | 'low' }
  ): Promise<void> {
    try {
      const subscription = this.subscriptions.get(client.id);
      if (!subscription) {
        this.logger.warn(`❌ No subscription found for client ${client.id}`);
        return;
      }

      subscription.subscribedAssets.add(data.assetId);
      if (data.updateFrequency) {
        subscription.updateFrequency = data.updateFrequency;
      }

      client.emit('subscription_confirmed', {
        assetId: data.assetId,
        message: `Subscribed to asset ${data.assetId} updates`
      });

      this.logger.debug(`📊 Client ${client.id} subscribed to asset ${data.assetId}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Subscription error: ${errorMessage}`);
      client.emit('subscription_error', { message: 'Failed to subscribe to asset' });
    }
  }

  async handleAssetUnsubscription(
    client: Socket,
    data: { assetId: number }
  ): Promise<void> {
    try {
      const subscription = this.subscriptions.get(client.id);
      if (subscription) {
        subscription.subscribedAssets.delete(data.assetId);
        
        client.emit('unsubscription_confirmed', {
          assetId: data.assetId,
          message: `Unsubscribed from asset ${data.assetId} updates`
        });

        this.logger.debug(`📊 Client ${client.id} unsubscribed from asset ${data.assetId}`);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Unsubscription error: ${errorMessage}`);
    }
  }

  async handlePriceAlert(
    client: Socket,
    alertData: {
      assetId: number;
      type: 'above' | 'below' | 'change_percent';
      threshold: number;
      enabled: boolean;
    }
  ): Promise<void> {
    try {
      if (!this.priceAlerts.has(client.id)) {
        this.priceAlerts.set(client.id, []);
      }

      const alerts = this.priceAlerts.get(client.id)!;
      
      // เช็คจำนวน alerts สูงสุด
      if (alerts.length >= this.config.maxAlertsPerUser) {
        client.emit('alert_error', { message: 'Maximum number of alerts reached' });
        return;
      }

      const newAlert: PriceAlert = {
        id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        assetId: alertData.assetId,
        userId: client.id,
        type: alertData.type,
        threshold: alertData.threshold,
        enabled: alertData.enabled,
        triggered: false,
        createdAt: new Date()
      };

      alerts.push(newAlert);

      client.emit('alert_created', {
        alertId: newAlert.id,
        message: 'Price alert created successfully'
      });

      this.logger.debug(`🚨 Price alert created: ${newAlert.id} for asset ${alertData.assetId}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Alert creation error: ${errorMessage}`);
      client.emit('alert_error', { message: 'Failed to create price alert' });
    }
  }

  // ========================================
  //  Broadcasting Methods
  // ========================================

  /**
   * Broadcast price update ให้ session
   */
  async broadcastPriceUpdate(
    sessionId: number,
    priceData: MarketPriceData
  ): Promise<void> {
    try {
      const message: PriceBroadcastMessage = {
        type: 'price_update',
        timestamp: new Date(),
        sessionId,
        data: priceData
      };

      // ส่งให้ทุกคนใน session
      this.server.to(`session_${sessionId}`).emit('price_update', message);

      // เช็ค price alerts
      await this.checkPriceAlerts(sessionId, priceData);

      this.logger.debug(`📊 Price update broadcasted: Asset ${priceData.assetId}, Price ${priceData.currentPrice}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Price broadcast error: ${errorMessage}`);
    }
  }

  /**
   * Broadcast market analysis ให้ผู้ที่ subscribe
   */
  async broadcastMarketAnalysis(
    sessionId: number,
    assetId: number,
    analysis: MarketAnalysis
  ): Promise<void> {
    try {
      const sessionClients = this.sessionRooms.get(sessionId);
      if (!sessionClients) return;

      for (const clientId of sessionClients) {
        const subscription = this.subscriptions.get(clientId);
        
        if (subscription && 
            subscription.includeAnalysis && 
            subscription.subscribedAssets.has(assetId)) {
          
          const client = this.server.sockets.sockets.get(clientId);
          if (client) {
            client.emit('market_analysis', {
              type: 'market_analysis',
              timestamp: new Date(),
              sessionId,
              assetId,
              data: analysis
            });
          }
        }
      }

      this.logger.debug(`📈 Market analysis broadcasted: Asset ${assetId}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Analysis broadcast error: ${errorMessage}`);
    }
  }

  /**
   * Broadcast market forecast
   */
  async broadcastMarketForecast(
    sessionId: number,
    forecast: MarketForecast
  ): Promise<void> {
    try {
      const sessionClients = this.sessionRooms.get(sessionId);
      if (!sessionClients) return;

      for (const clientId of sessionClients) {
        const subscription = this.subscriptions.get(clientId);
        
        if (subscription && 
            subscription.includeForecast && 
            subscription.subscribedAssets.has(forecast.assetId)) {
          
          const client = this.server.sockets.sockets.get(clientId);
          if (client) {
            client.emit('market_forecast', {
              type: 'market_forecast',
              timestamp: new Date(),
              sessionId,
              data: forecast
            });
          }
        }
      }

      this.logger.debug(`🔮 Market forecast broadcasted: Asset ${forecast.assetId}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Forecast broadcast error: ${errorMessage}`);
    }
  }

  /**
   * Broadcast market snapshot (overview)
   */
  async broadcastMarketSnapshot(
    sessionId: number,
    snapshot: MarketSnapshot
  ): Promise<void> {
    try {
      const message = {
        type: 'market_snapshot',
        timestamp: new Date(),
        sessionId,
        data: snapshot
      };

      this.server.to(`session_${sessionId}`).emit('market_snapshot', message);

      this.logger.debug(`📸 Market snapshot broadcasted to session ${sessionId}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Snapshot broadcast error: ${errorMessage}`);
    }
  }

  /**
   * Broadcast market event notification
   */
  async broadcastMarketEvent(
    sessionId: number,
    eventType: MarketEventType,
    eventData: any
  ): Promise<void> {
    try {
      const message = {
        type: 'market_event',
        timestamp: new Date(),
        sessionId,
        eventType,
        data: eventData
      };

      this.server.to(`session_${sessionId}`).emit('market_event', message);

      this.logger.log(`📢 Market event broadcasted: ${eventType} to session ${sessionId}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Event broadcast error: ${errorMessage}`);
    }
  }

  // ========================================
  //  Price Alert System
  // ========================================

  /**
   * เช็ค price alerts และส่งแจ้งเตือน
   */
  private async checkPriceAlerts(sessionId: number, priceData: MarketPriceData): Promise<void> {
    try {
      const sessionClients = this.sessionRooms.get(sessionId);
      if (!sessionClients) return;

      for (const clientId of sessionClients) {
        const alerts = this.priceAlerts.get(clientId);
        if (!alerts) continue;

        for (const alert of alerts) {
          if (!alert.enabled || alert.triggered || alert.assetId !== priceData.assetId) {
            continue;
          }

          let shouldTrigger = false;

          switch (alert.type) {
            case 'above':
              shouldTrigger = priceData.currentPrice >= alert.threshold;
              break;
            case 'below':
              shouldTrigger = priceData.currentPrice <= alert.threshold;
              break;
            case 'change_percent':
              const changePercent = priceData.changePercent || 0;
              shouldTrigger = Math.abs(changePercent) >= alert.threshold;
              break;
          }

          if (shouldTrigger) {
            await this.triggerPriceAlert(clientId, alert, priceData);
          }
        }
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Alert checking error: ${errorMessage}`);
    }
  }

  /**
   * Trigger price alert
   */
  private async triggerPriceAlert(clientId: string, alert: PriceAlert, priceData: MarketPriceData): Promise<void> {
    try {
      alert.triggered = true;
      alert.triggeredAt = new Date();

      const client = this.server.sockets.sockets.get(clientId);
      if (client) {
        client.emit('price_alert_triggered', {
          alertId: alert.id,
          assetId: alert.assetId,
          currentPrice: priceData.currentPrice,
          threshold: alert.threshold,
          type: alert.type,
          message: this.generateAlertMessage(alert, priceData)
        });
      }

      this.logger.log(`🚨 Price alert triggered: ${alert.id} for client ${clientId}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Alert trigger error: ${errorMessage}`);
    }
  }

  // ========================================
  //  Helper Methods
  // ========================================

  private async initializeBroadcastingEngine(): Promise<void> {
    this.logger.debug('🔧 Initializing broadcasting engine...');
    
    // Setup periodic dashboard updates
    setInterval(() => {
      this.broadcastDashboardUpdates();
    }, this.config.dashboardUpdateInterval);
  }

  private extractSessionId(client: Socket): number | null {
    try {
      const sessionId = client.handshake.query.sessionId as string;
      return sessionId ? parseInt(sessionId, 10) : null;
    } catch {
      return null;
    }
  }

  private async sendInitialMarketData(client: Socket, sessionId: number): Promise<void> {
    try {
      // ส่งข้อมูลเริ่มต้นเมื่อ connect
      client.emit('connection_established', {
        sessionId,
        timestamp: new Date(),
        message: 'Connected to market data stream'
      });

      this.logger.debug(`📱 Initial market data sent to client ${client.id}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Initial data error: ${errorMessage}`);
    }
  }

  private generateAlertMessage(alert: PriceAlert, priceData: MarketPriceData): string {
    switch (alert.type) {
      case 'above':
        return `Price for asset ${alert.assetId} has reached ${priceData.currentPrice}, above your threshold of ${alert.threshold}`;
      case 'below':
        return `Price for asset ${alert.assetId} has dropped to ${priceData.currentPrice}, below your threshold of ${alert.threshold}`;
      case 'change_percent':
        return `Price for asset ${alert.assetId} has changed by ${priceData.changePercent}%, exceeding your threshold of ${alert.threshold}%`;
      default:
        return `Price alert triggered for asset ${alert.assetId}`;
    }
  }

  private async broadcastDashboardUpdates(): Promise<void> {
    try {
      // ส่ง dashboard updates ตามช่วงเวลาที่กำหนด
      // TODO: Implementation ขึ้นอยู่กับ business requirements

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Dashboard update error: ${errorMessage}`);
    }
  }

  // ========================================
  //  Public Utility Methods
  // ========================================

  /**
   * ดึงสถิติการเชื่อมต่อ
   */
  getConnectionStats() {
    let totalConnections = 0;
    let totalAlerts = 0;
    
    for (const clients of this.sessionRooms.values()) {
      totalConnections += clients.size;
    }

    for (const alerts of this.priceAlerts.values()) {
      totalAlerts += alerts.length;
    }

    return {
      totalConnections,
      activeSessions: this.sessionRooms.size,
      totalSubscriptions: this.subscriptions.size,
      totalAlerts,
      config: this.config
    };
  }

  /**
   * ส่งข้อความกำหนดเองให้ session
   */
  async sendCustomMessage(sessionId: number, eventName: string, data: any): Promise<void> {
    try {
      this.server.to(`session_${sessionId}`).emit(eventName, {
        timestamp: new Date(),
        sessionId,
        data
      });

      this.logger.debug(`📧 Custom message sent: ${eventName} to session ${sessionId}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Custom message error: ${errorMessage}`);
    }
  }

  /**
   * Disconnect ทุกคนใน session
   */
  async disconnectSession(sessionId: number): Promise<void> {
    try {
      const sessionClients = this.sessionRooms.get(sessionId);
      if (!sessionClients) return;

      for (const clientId of sessionClients) {
        const client = this.server.sockets.sockets.get(clientId);
        if (client) {
          client.disconnect();
        }
      }

      this.sessionRooms.delete(sessionId);
      this.logger.log(`📱 All clients disconnected from session ${sessionId}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`❌ Session disconnect error: ${errorMessage}`);
    }
  }
}