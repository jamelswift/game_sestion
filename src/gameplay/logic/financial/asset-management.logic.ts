import { PrismaService } from '../../../prisma/prisma.service';

// ============================================================================
// Asset Management Interfaces
// ============================================================================
export interface AssetPurchaseRequest {
  playerInSessionId: number;
  assetId: number;
  quantity: number;
  useType: 'cash' | 'savings' | 'mixed' | 'loan';
  maxPrice?: number; // ราคาสูงสุดที่ยอมซื้อ
}

export interface AssetSaleRequest {
  playerInSessionId: number;
  playerAssetId: number;
  quantity: number;
  saleType: 'immediate' | 'market_order' | 'limit_order';
  minPrice?: number; // ราคาต่ำสุดที่ยอมขาย
}

export interface AssetTransaction {
  success: boolean;
  message: string;
  transaction?: {
    type: 'buy' | 'sell';
    assetName: string;
    quantity: number;
    unitPrice: number;
    totalAmount: number;
    fees: number;
    netAmount: number;
    newCashBalance: number;
    newSavingsBalance?: number;
    gainLoss?: number; // สำหรับการขาย
  };
  error?: string;
}

export interface PortfolioSummary {
  totalValue: number;
  totalCost: number;
  unrealizedGainLoss: number;
  realizedGainLoss: number;
  monthlyPassiveIncome: number;
  portfolioReturn: number; // %
  assetsByType: AssetTypeBreakdown[];
  topPerformers: AssetPerformance[];
  worstPerformers: AssetPerformance[];
}

export interface AssetTypeBreakdown {
  type: string;
  count: number;
  totalValue: number;
  totalCost: number;
  monthlyIncome: number;
  allocation: number; // % ของ portfolio
  performance: number; // % return
}

export interface AssetPerformance {
  assetId: number;
  assetName: string;
  quantity: number;
  currentValue: number;
  totalCost: number;
  gainLoss: number;
  gainLossPercentage: number;
  monthlyIncome: number;
}

export interface AssetMarketData {
  assetId: number;
  assetName: string;
  currentPrice: number;
  previousPrice: number;
  priceChange: number;
  priceChangePercentage: number;
  volume: number;
  marketCap: number;
  isAvailable: boolean;
}

// ============================================================================
// Asset Management Logic
// ============================================================================
export class AssetManagementLogic {
  constructor(private readonly prisma: PrismaService) {}

  // ========================================
  // 💰 Asset Purchase Methods
  // ========================================

  /**
   * ซื้อสินทรัพย์
   */
  async purchaseAsset(request: AssetPurchaseRequest): Promise<AssetTransaction> {
    try {
      // ตรวจสอบข้อมูลพื้นฐาน
      const validation = await this.validatePurchase(request);
      if (!validation.valid) {
        return { success: false, message: validation.message! };
      }

      const { player, asset, currentPrice } = validation;
      const totalCost = currentPrice * request.quantity;
      const fees = this.calculateTransactionFees(totalCost, 'buy');
      const totalWithFees = totalCost + fees;

      // ตรวจสอบเงินทุน
      const fundingCheck = await this.checkAvailableFunds(player!, totalWithFees, request.useType);
      if (!fundingCheck.sufficient) {
        return { 
          success: false, 
          message: `เงินไม่เพียงพอ ต้องการ ${totalWithFees.toLocaleString()} บาท (รวมค่าธรรมเนียม) มีอยู่ ${fundingCheck.available.toLocaleString()} บาท` 
        };
      }

      // ตรวจสอบราคาสูงสุด (ถ้ามี)
      if (request.maxPrice && currentPrice > request.maxPrice) {
        return {
          success: false,
          message: `ราคาปัจจุบัน ${currentPrice.toLocaleString()} สูงกว่าราคาสูงสุดที่ตั้งไว้ ${request.maxPrice.toLocaleString()}`
        };
      }

      // ดำเนินการซื้อ
      const transaction = await this.processPurchase(request, asset!, currentPrice, fees, fundingCheck.funding);

      // อัปเดตสถิติ
      await this.updateStatsAfterPurchase(request.playerInSessionId, asset!, totalCost);

      return {
        success: true,
        message: `ซื้อ ${asset!.name} จำนวน ${request.quantity} หน่วย สำเร็จ`,
        transaction: {
          type: 'buy',
          assetName: asset!.name,
          quantity: request.quantity,
          unitPrice: currentPrice,
          totalAmount: totalCost,
          fees,
          netAmount: totalWithFees,
          newCashBalance: transaction.newCashBalance,
          newSavingsBalance: transaction.newSavingsBalance
        }
      };
    } catch (error) {
      console.error('Error purchasing asset:', error);
      return { success: false, message: 'เกิดข้อผิดพลาดในการซื้อสินทรัพย์', error: error.message };
    }
  }

  /**
   * ขายสินทรัพย์
   */
  async sellAsset(request: AssetSaleRequest): Promise<AssetTransaction> {
    try {
      // ตรวจสอบการถือครอง
      const playerAsset = await this.prisma.playerAsset.findUnique({
        where: { id: request.playerAssetId },
        include: { asset: true, playerInSession: true }
      });

      if (!playerAsset) {
        return { success: false, message: 'ไม่พบสินทรัพย์ที่ต้องการขาย' };
      }

      if (playerAsset.playerInSessionId !== request.playerInSessionId) {
        return { success: false, message: 'ไม่มีสิทธิ์ขายสินทรัพย์นี้' };
      }

      if (playerAsset.quantity < request.quantity) {
        return { success: false, message: `มีสินทรัพย์ไม่เพียงพอ มีอยู่ ${playerAsset.quantity} หน่วย` };
      }

      // คำนวณราคาขาย
      const currentPrice = await this.getCurrentAssetPrice(playerAsset.assetId, playerAsset.playerInSession.sessionId);
      
      // ตรวจสอบราคาต่ำสุด (ถ้ามี)
      if (request.minPrice && currentPrice < request.minPrice) {
        return {
          success: false,
          message: `ราคาปัจจุบัน ${currentPrice.toLocaleString()} ต่ำกว่าราคาต่ำสุดที่ตั้งไว้ ${request.minPrice.toLocaleString()}`
        };
      }

      const totalSaleValue = currentPrice * request.quantity;
      const fees = this.calculateTransactionFees(totalSaleValue, 'sell');
      const netProceeds = totalSaleValue - fees;

      // คำนวณกำไร/ขาดทุน
      const costBasis = playerAsset.purchasePrice * request.quantity;
      const gainLoss = netProceeds - costBasis;

      // ดำเนินการขาย
      const transaction = await this.processSale(request, playerAsset, currentPrice, fees);

      // อัปเดตสถิติ
      await this.updateStatsAfterSale(request.playerInSessionId, totalSaleValue, gainLoss);

      return {
        success: true,
        message: `ขาย ${playerAsset.asset.name} จำนวน ${request.quantity} หน่วย สำเร็จ`,
        transaction: {
          type: 'sell',
          assetName: playerAsset.asset.name,
          quantity: request.quantity,
          unitPrice: currentPrice,
          totalAmount: totalSaleValue,
          fees,
          netAmount: netProceeds,
          newCashBalance: transaction.newCashBalance,
          gainLoss
        }
      };
    } catch (error) {
      console.error('Error selling asset:', error);
      return { success: false, message: 'เกิดข้อผิดพลาดในการขายสินทรัพย์', error: error.message };
    }
  }

  // ========================================
  // 📊 Portfolio Analysis Methods
  // ========================================

  /**
   * ดึงสรุปพอร์ตโฟลิโอ
   */
  async getPortfolioSummary(playerInSessionId: number): Promise<PortfolioSummary | null> {
    try {
      const playerAssets = await this.prisma.playerAsset.findMany({
        where: { playerInSessionId },
        include: { 
          asset: true,
          playerInSession: {
            include: { session: true }
          }
        }
      });

      if (playerAssets.length === 0) {
        return this.getEmptyPortfolio();
      }

      let totalValue = 0;
      let totalCost = 0;
      let monthlyPassiveIncome = 0;
      const assetTypeMap = new Map<string, AssetTypeBreakdown>();
      const performances: AssetPerformance[] = [];

      for (const playerAsset of playerAssets) {
        const currentPrice = await this.getCurrentAssetPrice(
          playerAsset.assetId, 
          playerAsset.playerInSession.sessionId
        );
        
        const assetValue = currentPrice * playerAsset.quantity;
        const assetCost = playerAsset.purchasePrice * playerAsset.quantity;
        const assetIncome = Number(playerAsset.asset.cashFlow) * playerAsset.quantity;
        const gainLoss = assetValue - assetCost;
        const gainLossPercentage = assetCost > 0 ? (gainLoss / assetCost) * 100 : 0;

        totalValue += assetValue;
        totalCost += assetCost;
        monthlyPassiveIncome += assetIncome;

        // Asset Performance
        performances.push({
          assetId: playerAsset.assetId,
          assetName: playerAsset.asset.name,
          quantity: playerAsset.quantity,
          currentValue: assetValue,
          totalCost: assetCost,
          gainLoss,
          gainLossPercentage,
          monthlyIncome: assetIncome
        });

        // จัดกลุ่มตามประเภท
        const type = playerAsset.asset.type;
        if (!assetTypeMap.has(type)) {
          assetTypeMap.set(type, {
            type,
            count: 0,
            totalValue: 0,
            totalCost: 0,
            monthlyIncome: 0,
            allocation: 0,
            performance: 0
          });
        }

        const typeData = assetTypeMap.get(type)!;
        typeData.count += playerAsset.quantity;
        typeData.totalValue += assetValue;
        typeData.totalCost += assetCost;
        typeData.monthlyIncome += assetIncome;
      }

      // คำนวณ allocation และ performance สำหรับแต่ละประเภท
      assetTypeMap.forEach(typeData => {
        typeData.allocation = totalValue > 0 ? (typeData.totalValue / totalValue) * 100 : 0;
        typeData.performance = typeData.totalCost > 0 ? ((typeData.totalValue - typeData.totalCost) / typeData.totalCost) * 100 : 0;
      });

      // เรียงลำดับ performance
      const sortedPerformances = performances.sort((a, b) => b.gainLossPercentage - a.gainLossPercentage);

      return {
        totalValue,
        totalCost,
        unrealizedGainLoss: totalValue - totalCost,
        realizedGainLoss: 0, // TODO: ดึงจาก transaction history
        monthlyPassiveIncome,
        portfolioReturn: totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0,
        assetsByType: Array.from(assetTypeMap.values()),
        topPerformers: sortedPerformances.slice(0, 3),
        worstPerformers: sortedPerformances.slice(-3).reverse()
      };
    } catch (error) {
      console.error('Error getting portfolio summary:', error);
      return null;
    }
  }

  /**
   * ดึงข้อมูลตลาดสินทรัพย์
   */
  async getAssetMarketData(sessionId: number): Promise<AssetMarketData[]> {
    try {
      const assets = await this.prisma.asset.findMany();
      const marketData: AssetMarketData[] = [];

      for (const asset of assets) {
        const sessionState = await this.prisma.sessionAssetState.findUnique({
          where: { sessionId_assetId: { sessionId, assetId: asset.id } }
        });

        const currentPrice = sessionState ? Number(sessionState.currentPrice) : Number(asset.cost);
        const previousPrice = Number(asset.cost); // TODO: ดึงราคาก่อนหน้า
        const priceChange = currentPrice - previousPrice;
        const priceChangePercentage = previousPrice > 0 ? (priceChange / previousPrice) * 100 : 0;

        marketData.push({
          assetId: asset.id,
          assetName: asset.name,
          currentPrice,
          previousPrice,
          priceChange,
          priceChangePercentage,
          volume: 0, // TODO: คำนวณจาก transaction history
          marketCap: 0, // TODO: คำนวณ market cap
          isAvailable: sessionState ? sessionState.isAvailable : true
        });
      }

      return marketData.sort((a, b) => b.priceChangePercentage - a.priceChangePercentage);
    } catch (error) {
      console.error('Error getting asset market data:', error);
      return [];
    }
  }

  /**
   * ดึงรายการสินทรัพย์ที่ถือครอง
   */
  async getPlayerAssets(playerInSessionId: number) {
    try {
      return await this.prisma.playerAsset.findMany({
        where: { playerInSessionId },
        include: { 
          asset: true,
          playerInSession: {
            include: { session: true }
          }
        }
      });
    } catch (error) {
      console.error('Error getting player assets:', error);
      return [];
    }
  }

  /**
   * แนะนำการลงทุน
   */
  async getInvestmentRecommendations(playerInSessionId: number): Promise<{
    recommended: AssetMarketData[];
    reasons: string[];
  }> {
    try {
      const player = await this.prisma.playerInSession.findUnique({
        where: { id: playerInSessionId },
        include: { session: true }
      });

      if (!player) return { recommended: [], reasons: [] };

      const marketData = await this.getAssetMarketData(player.sessionId);
      const portfolio = await this.getPortfolioSummary(playerInSessionId);
      
      const recommended: AssetMarketData[] = [];
      const reasons: string[] = [];

      // แนะนำตามความเสี่ยงและผลตอบแทน
      const highGrowthAssets = marketData.filter(asset => 
        asset.priceChangePercentage > 5 && asset.isAvailable
      ).slice(0, 2);

      const stableIncomeAssets = marketData.filter(asset => 
        asset.priceChangePercentage > -2 && asset.priceChangePercentage < 5 && asset.isAvailable
      ).slice(0, 2);

      recommended.push(...highGrowthAssets, ...stableIncomeAssets);

      if (portfolio && portfolio.assetsByType.length < 3) {
        reasons.push('💡 แนะนำให้กระจายการลงทุนในสินทรัพย์หลายประเภท');
      }

      if (highGrowthAssets.length > 0) {
        reasons.push('📈 มีสินทรัพย์ที่มีแนวโน้มเติบโตดี');
      }

      if (player.cash > 50000) {
        reasons.push('💰 มีเงินสดเพียงพอสำหรับการลงทุน');
      }

      return { recommended, reasons };
    } catch (error) {
      console.error('Error getting investment recommendations:', error);
      return { recommended: [], reasons: [] };
    }
  }

  // ========================================
  // 🔧 Private Helper Methods
  // ========================================

  private async validatePurchase(request: AssetPurchaseRequest) {
    // ตรวจสอบผู้เล่น
    const player = await this.prisma.playerInSession.findUnique({
      where: { id: request.playerInSessionId },
      include: { session: true }
    });

    if (!player) {
      return { valid: false, message: 'ไม่พบข้อมูลผู้เล่น' };
    }

    // ตรวจสอบสินทรัพย์
    const asset = await this.prisma.asset.findUnique({
      where: { id: request.assetId }
    });

    if (!asset) {
      return { valid: false, message: 'ไม่พบสินทรัพย์ที่ต้องการซื้อ' };
    }

    // ตรวจสอบจำนวน
    if (request.quantity <= 0) {
      return { valid: false, message: 'จำนวนที่ซื้อต้องมากกว่า 0' };
    }

    // ตรวจสอบว่าสินทรัพย์ยังขายอยู่หรือไม่
    const sessionState = await this.prisma.sessionAssetState.findUnique({
      where: { sessionId_assetId: { sessionId: player.sessionId, assetId: request.assetId } }
    });

    if (sessionState && !sessionState.isAvailable) {
      return { valid: false, message: 'สินทรัพย์นี้ไม่สามารถซื้อได้ในขณะนี้' };
    }

    // ดึงราคาปัจจุบัน
    const currentPrice = await this.getCurrentAssetPrice(request.assetId, player.sessionId);

    return { valid: true, player, asset, currentPrice };
  }

  private async checkAvailableFunds(player: any, requiredAmount: number, useType: string) {
    const cash = Number(player.cash);
    const savings = Number(player.savings);

    let available = 0;
    let funding = { fromCash: 0, fromSavings: 0, fromLoan: 0 };

    switch (useType) {
      case 'cash':
        available = cash;
        if (available >= requiredAmount) {
          funding.fromCash = requiredAmount;
        }
        break;
      case 'savings':
        available = savings;
        if (available >= requiredAmount) {
          funding.fromSavings = requiredAmount;
        }
        break;
      case 'mixed':
        available = cash + savings;
        if (available >= requiredAmount) {
          if (cash >= requiredAmount) {
            funding.fromCash = requiredAmount;
          } else {
            funding.fromCash = cash;
            funding.fromSavings = requiredAmount - cash;
          }
        }
        break;
      case 'loan':
        // TODO: ดำเนินการกู้เงิน
        available = cash + savings + 100000; // กู้ได้สูงสุด 100k
        if (cash + savings >= requiredAmount) {
          funding.fromCash = Math.min(cash, requiredAmount);
          funding.fromSavings = Math.min(savings, requiredAmount - funding.fromCash);
        } else {
          funding.fromCash = cash;
          funding.fromSavings = savings;
          funding.fromLoan = requiredAmount - cash - savings;
        }
        break;
    }

    return {
      sufficient: available >= requiredAmount,
      available,
      funding
    };
  }

  private async processPurchase(request: AssetPurchaseRequest, asset: any, currentPrice: number, fees: number, funding: any) {
    return await this.prisma.$transaction(async (prisma) => {
      // อัปเดตเงิน
      const newCash = Number(await this.getCash(request.playerInSessionId)) - funding.fromCash;
      const newSavings = Number(await this.getSavings(request.playerInSessionId)) - funding.fromSavings;

      await prisma.playerInSession.update({
        where: { id: request.playerInSessionId },
        data: {
          cash: newCash,
          savings: newSavings
        }
      });

      // TODO: จัดการกู้เงิน ถ้า funding.fromLoan > 0

      // ตรวจสอบว่ามีสินทรัพย์ประเภทนี้แล้วหรือไม่
      const existingAsset = await prisma.playerAsset.findFirst({
        where: {
          playerInSessionId: request.playerInSessionId,
          assetId: request.assetId
        }
      });

      if (existingAsset) {
        // อัปเดตจำนวนและราคาเฉลี่ย
        const newQuantity = existingAsset.quantity + request.quantity;
        const newAveragePrice = (
          (existingAsset.quantity * existingAsset.purchasePrice) + 
          (request.quantity * currentPrice)
        ) / newQuantity;

        await prisma.playerAsset.update({
          where: { id: existingAsset.id },
          data: {
            quantity: newQuantity,
            purchasePrice: newAveragePrice
          }
        });
      } else {
        // สร้างการถือครองใหม่
        await prisma.playerAsset.create({
          data: {
            playerInSessionId: request.playerInSessionId,
            assetId: request.assetId,
            quantity: request.quantity,
            purchasePrice: currentPrice
          }
        });
      }

      return { newCashBalance: newCash, newSavingsBalance: newSavings };
    });
  }

  private async processSale(request: AssetSaleRequest, playerAsset: any, currentPrice: number, fees: number) {
    return await this.prisma.$transaction(async (prisma) => {
      const saleValue = currentPrice * request.quantity;
      const netProceeds = saleValue - fees;
      
      // อัปเดตเงินสด
      const currentCash = Number(await this.getCash(request.playerInSessionId));
      const newCash = currentCash + netProceeds;

      await prisma.playerInSession.update({
        where: { id: request.playerInSessionId },
        data: { cash: newCash }
      });

      // อัปเดตหรือลบการถือครอง
      if (playerAsset.quantity === request.quantity) {
        // ขายหมด
        await prisma.playerAsset.delete({
          where: { id: request.playerAssetId }
        });
      } else {
        // ขายบางส่วน
        await prisma.playerAsset.update({
          where: { id: request.playerAssetId },
          data: { quantity: playerAsset.quantity - request.quantity }
        });
      }

      return { newCashBalance: newCash };
    });
  }

  private calculateTransactionFees(amount: number, type: 'buy' | 'sell'): number {
    // ค่าธรรมเนียม 0.5% สำหรับการซื้อ, 0.75% สำหรับการขาย
    const feeRate = type === 'buy' ? 0.005 : 0.0075;
    return Math.round(amount * feeRate);
  }

  private async getCurrentAssetPrice(assetId: number, sessionId: number): Promise<number> {
    // ตรวจสอบราคาใน session ก่อน
    const sessionPrice = await this.prisma.sessionAssetState.findUnique({
      where: { sessionId_assetId: { sessionId, assetId } }
    });

    if (sessionPrice) {
      return Number(sessionPrice.currentPrice);
    }

    // ถ้าไม่มี ใช้ราคาเริ่มต้น
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId }
    });

    return asset ? Number(asset.cost) : 0;
  }

  private async getCash(playerInSessionId: number): Promise<number> {
    const player = await this.prisma.playerInSession.findUnique({
      where: { id: playerInSessionId }
    });
    return player ? Number(player.cash) : 0;
  }

  private async getSavings(playerInSessionId: number): Promise<number> {
    const player = await this.prisma.playerInSession.findUnique({
      where: { id: playerInSessionId }
    });
    return player ? Number(player.savings) : 0;
  }

  private getEmptyPortfolio(): PortfolioSummary {
    return {
      totalValue: 0,
      totalCost: 0,
      unrealizedGainLoss: 0,
      realizedGainLoss: 0,
      monthlyPassiveIncome: 0,
      portfolioReturn: 0,
      assetsByType: [],
      topPerformers: [],
      worstPerformers: []
    };
  }

  private async updateStatsAfterPurchase(playerInSessionId: number, asset: any, amount: number) {
    // TODO: อัปเดตคะแนนการลงทุนผ่าน PlayerStatsService
    // const investingBonus = Math.min(5, Math.floor(amount / 10000));
    console.log(`💡 Player ${playerInSessionId} purchased ${asset.name} worth ${amount}`);
  }

  private async updateStatsAfterSale(playerInSessionId: number, amount: number, gainLoss: number) {
    // TODO: อัปเดตคะแนนการลงทุนผ่าน PlayerStatsService
    console.log(`💡 Player ${playerInSessionId} sold assets worth ${amount}, gain/loss: ${gainLoss}`);
  }
}