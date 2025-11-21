import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Career } from 'src/entities/career.entity';
import { Goal } from 'src/entities/goal.entity';
import { Card } from 'src/entities/card.entity';
import { Asset } from 'src/entities/asset.entity';
import { Debt } from 'src/entities/debt.entity';
import { BoardSpace } from 'src/entities/board-space.entity';


@Injectable()
export class CatalogService {
  constructor(private prisma: PrismaService) {}

  async getCareers() {
    try {
      return await this.prisma.career.findMany({
        include: {
          startingExpenses: true,
          startingDebts: true,
        },
        orderBy: {
          name: 'asc',
        },
      });
    } catch (error) {
      console.error('Error fetching careers:', error);
      throw new Error('Failed to fetch careers');
    }
  }


  async getGoals() {
    try {
      return await this.prisma.goal.findMany({
        orderBy: [
          { type: 'asc' }, // Main goals first, then milestones
          { name: 'asc' },
        ],
      });
    } catch (error) {
      console.error('Error fetching goals:', error);
      throw new Error('Failed to fetch goals');
    }
  }


  async getCards(gameLevel?: string) {
    try {
      const whereClause = gameLevel ? { gameLevel } : {};
      
      return await this.prisma.card.findMany({
        where: whereClause,
        orderBy: [
          { type: 'asc' },
          { title: 'asc' },
        ],
      });
    } catch (error) {
      console.error('Error fetching cards:', error);
      throw new Error('Failed to fetch cards');
    }
  }


  async getCardsByType(cardType: string, gameLevel?: string) {
    try {
      const whereClause: any = { type: cardType };
      if (gameLevel) {
        whereClause.gameLevel = gameLevel;
      }

      return await this.prisma.card.findMany({
        where: whereClause,
        orderBy: {
          title: 'asc',
        },
      });
    } catch (error) {
      console.error('Error fetching cards by type:', error);
      throw new Error('Failed to fetch cards by type');
    }
  }


  async getAssets() {
    try {
      return await this.prisma.asset.findMany({
        orderBy: [
          { type: 'asc' },
          { cost: 'asc' },
        ],
      });
    } catch (error) {
      console.error('Error fetching assets:', error);
      throw new Error('Failed to fetch assets');
    }
  }


  async getAssetsByType(assetType: string) {
    try {
      return await this.prisma.asset.findMany({
        where: { type: assetType },
        orderBy: {
          cost: 'asc',
        },
      });
    } catch (error) {
      console.error('Error fetching assets by type:', error);
      throw new Error('Failed to fetch assets by type');
    }
  }

  async getDebts() {
    try {
      return await this.prisma.debt.findMany({
        orderBy: {
          principalAmount: 'asc',
        },
      });
    } catch (error) {
      console.error('Error fetching debts:', error);
      throw new Error('Failed to fetch debts');
    }
  }


  async getBoardSpaces() {
    try {
      return await this.prisma.boardSpace.findMany({
        orderBy: {
          position: 'asc',
        },
      });
    } catch (error) {
      console.error('Error fetching board spaces:', error);
      throw new Error('Failed to fetch board spaces');
    }
  }


  async getAllCatalogData(gameLevel?: string) {
    try {
      const [careers, goals, cards, assets, debts, boardSpaces] = await Promise.all([
        this.getCareers(),
        this.getGoals(),
        this.getCards(gameLevel),
        this.getAssets(),
        this.getDebts(),
        this.getBoardSpaces(),
      ]);

      return {
        careers,
        goals,
        cards,
        assets,
        debts,
        boardSpaces,
      };
    } catch (error) {
      console.error('Error fetching catalog data:', error);
      throw new Error('Failed to fetch catalog data');
    }
  }
}

// Type definition for complete catalog data
export interface CatalogData {
  careers: Career[];
  goals: Goal[];
  cards: Card[];
  assets: Asset[];
  debts: Debt[];
  boardSpaces: BoardSpace[];
}