import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AssetManagementLogic } from '../financial/asset-management.logic';
import { DebtManagementLogic } from '../financial/debt-management.logic';
import { CashFlowLogic } from '../financial/cash-flow.logic';
import { PlayerStatsService } from '../financial/PlayerStatsService';

@Injectable()
export class CardEffectLogic {
  private assetLogic: AssetManagementLogic;
  private debtLogic: DebtManagementLogic;
  private cashFlowLogic: CashFlowLogic;
  private playerStatsService: PlayerStatsService;

  constructor(private readonly prisma: PrismaService) {
    this.assetLogic = new AssetManagementLogic(prisma);
    this.debtLogic = new DebtManagementLogic(prisma);
    this.cashFlowLogic = new CashFlowLogic(prisma);
    this.playerStatsService = new PlayerStatsService(prisma);
  }

  /**
   * ประมวลผลเอฟเฟกต์ของการ์ด
   */
  async executeCardEffect(cardId: number, playerId: number, effectData: any) {
    try {
      console.log(`🎯 Executing card effect for card ${cardId}, player ${playerId}`);
      
      // ประมวลผลตามประเภทของ effect
      if (effectData?.effect_type) {
        switch (effectData.effect_type) {
          case 'money':
            return await this.processMoneyEffect(playerId, effectData);
          case 'asset':
            return await this.processAssetEffect(playerId, effectData);
          case 'debt':
            return await this.processDebtEffect(playerId, effectData);
          case 'investment':
            return await this.processInvestmentEffect(playerId, effectData);
          case 'expense':
            return await this.processExpenseEffect(playerId, effectData);
          case 'choice':
            return await this.processChoiceEffect(playerId, effectData);
          case 'charity':
            return await this.processCharityEffect(playerId, effectData);
          case 'payday':
            return await this.processPaydayEffect(playerId, effectData.careerId);
          case 'life_event':
            return await this.processLifeEventEffect(playerId, effectData);
          default:
            return this.processGenericEffect(playerId, effectData);
        }
      }

      return {
        success: false,
        message: 'No effect to process'
      };
    } catch (error) {
      console.error('Error executing card effect:', error);
      return {
        success: false,
        message: 'Error processing card effect',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * ประมวลผล effect ประเภทเงิน
   */
  private async processMoneyEffect(playerId: number, effectData: any) {
    const amount = effectData.amount || 0;
    const category = effectData.category || 'card_effect';
    
    try {
      if (amount !== 0) {
        // ใช้ CashFlowLogic เพื่อบันทึกรายการ
        await this.cashFlowLogic.recordTransaction({
          playerInSessionId: playerId,
          transactionType: amount > 0 ? 'income' : 'expense',
          amount: Math.abs(amount),
          category: category,
          description: effectData.description || `Card effect: ${amount > 0 ? 'gain' : 'loss'}`,
          toAccount: amount > 0 ? 'cash' : undefined,
          fromAccount: amount < 0 ? 'cash' : undefined
        });

        // อัปเดตสถิติผู้เล่น
        await this.playerStatsService.updatePersonalStats(playerId, {
          cardEffectsReceived: 1,
          totalMoneyFromCards: amount > 0 ? amount : 0
        });

        return {
          success: true,
          message: amount > 0 ? `Received $${amount}` : `Paid $${Math.abs(amount)}`,
          effect: amount > 0 ? 'money_gained' : 'money_lost',
          amount: Math.abs(amount)
        };
      }

      return {
        success: true,
        message: 'No money change',
        effect: 'no_change'
      };
    } catch (error) {
      console.error('Error processing money effect:', error);
      return {
        success: false,
        message: 'Error processing money effect',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * ประมวลผล effect ประเภทสินทรัพย์
   */
  private async processAssetEffect(playerId: number, effectData: any) {
    try {
      console.log(`Processing asset effect for player ${playerId}:`, effectData);
      
      if (effectData.action === 'buy' && effectData.assetId) {
        // ซื้อสินทรัพย์
        const result = await this.assetLogic.purchaseAsset({
          playerInSessionId: playerId,
          assetId: effectData.assetId,
          quantity: effectData.quantity || 1,
          useType: effectData.useType || 'cash',
          maxPrice: effectData.maxPrice
        });

        return {
          success: result.success,
          message: result.message,
          effect: 'asset_purchased',
          assetData: result.transaction
        };
      } else if (effectData.action === 'sell' && effectData.playerAssetId) {
        // ขายสินทรัพย์
        const result = await this.assetLogic.sellAsset({
          playerInSessionId: playerId,
          playerAssetId: effectData.playerAssetId,
          quantity: effectData.quantity || 1,
          saleType: effectData.saleType || 'immediate',
          minPrice: effectData.minPrice
        });

        return {
          success: result.success,
          message: result.message,
          effect: 'asset_sold',
          assetData: result.transaction
        };
      } else {
        // การ์ดให้เลือกซื้อสินทรัพย์
        return {
          success: true,
          message: 'Asset opportunity available',
          effect: 'asset_opportunity',
          requiresChoice: true,
          assetData: effectData
        };
      }
    } catch (error) {
      console.error('Error processing asset effect:', error);
      return {
        success: false,
        message: 'Error processing asset effect',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * ประมวลผล effect ประเภทหนี้สิน
   */
  private async processDebtEffect(playerId: number, effectData: any) {
    try {
      if (effectData.action === 'create_debt') {
        // สร้างหนี้ใหม่ (เช่น บัตรเครดิต, เงินกู้)
        const result = await this.debtLogic.applyForLoan({
          playerInSessionId: playerId,
          loanType: effectData.debtType || 'personal',
          amount: effectData.amount,
          purpose: effectData.description || 'Card effect debt',
          requestedTerms: effectData.termMonths
        });

        return {
          success: result.approved,
          message: result.message,
          effect: 'debt_created',
          debtData: result.terms
        };
      } else if (effectData.action === 'pay_debt') {
        // ชำระหนี้
        const result = await this.debtLogic.makePayment({
          playerInSessionId: playerId,
          debtId: effectData.debtId,
          amount: effectData.amount,
          paymentType: effectData.paymentType || 'extra',
          fromAccount: effectData.fromAccount || 'cash'
        });

        return {
          success: result.success,
          message: result.message,
          effect: 'debt_payment',
          paymentData: result.payment
        };
      }

      return {
        success: true,
        message: 'Debt effect processed',
        effect: 'debt_opportunity',
        requiresChoice: true,
        debtData: effectData
      };
    } catch (error) {
      console.error('Error processing debt effect:', error);
      return {
        success: false,
        message: 'Error processing debt effect',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * ประมวลผล effect ประเภทการลงทุน
   */
  private async processInvestmentEffect(playerId: number, effectData: any) {
    try {
      // บันทึกเป็นรายการลงทุน
      await this.cashFlowLogic.recordTransaction({
        playerInSessionId: playerId,
        transactionType: 'investment',
        amount: effectData.amount,
        category: effectData.category || 'investment',
        description: effectData.description || 'Investment from card',
        fromAccount: effectData.fromAccount || 'cash'
      });

      // อัปเดตสถิติการลงทุน
      await this.playerStatsService.updatePersonalStats(playerId, {
        investmentsMade: 1,
        totalInvested: effectData.amount
      });

      return {
        success: true,
        message: `Invested $${effectData.amount}`,
        effect: 'investment_made',
        amount: effectData.amount
      };
    } catch (error) {
      console.error('Error processing investment effect:', error);
      return {
        success: false,
        message: 'Error processing investment effect',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * ประมวลผล effect ประเภทค่าใช้จ่าย
   */
  private async processExpenseEffect(playerId: number, effectData: any) {
    try {
      // บันทึกเป็นค่าใช้จ่าย
      await this.cashFlowLogic.recordTransaction({
        playerInSessionId: playerId,
        transactionType: 'expense',
        amount: effectData.amount,
        category: effectData.category || 'unexpected_expense',
        description: effectData.description || 'Expense from card',
        fromAccount: effectData.fromAccount || 'cash'
      });

      return {
        success: true,
        message: `Paid expense of $${effectData.amount}`,
        effect: 'expense_paid',
        amount: effectData.amount
      };
    } catch (error) {
      console.error('Error processing expense effect:', error);
      return {
        success: false,
        message: 'Error processing expense effect',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * ประมวลผล effect ประเภท Life Event
   */
  private async processLifeEventEffect(playerId: number, effectData: any) {
    try {
      // Life events อาจมีผลกระทบหลายด้าน
      const results = [];

      // ผลกระทบทางการเงิน
      if (effectData.moneyEffect) {
        const moneyResult = await this.processMoneyEffect(playerId, effectData.moneyEffect);
        results.push(moneyResult);
      }

      // ผลกระทบต่อคะแนนความสุข
      if (effectData.happinessChange) {
        await this.prisma.playerInSession.update({
          where: { id: playerId },
          data: {
            happinessScore: {
              increment: effectData.happinessChange
            }
          }
        });
        results.push({
          success: true,
          message: `Happiness ${effectData.happinessChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(effectData.happinessChange)}`,
          effect: 'happiness_change'
        });
      }

      // อัปเดตสถิติ Life Events
      await this.playerStatsService.updatePersonalStats(playerId, {
        lifeEventsExperienced: 1
      });

      return {
        success: true,
        message: `Life event processed: ${effectData.title || 'Unknown event'}`,
        effect: 'life_event',
        results: results
      };
    } catch (error) {
      console.error('Error processing life event effect:', error);
      return {
        success: false,
        message: 'Error processing life event effect',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * ประมวลผล effect ประเภทการบริจาค
   */
  private async processCharityEffect(playerId: number, effectData: any) {
    try {
      const amount = effectData.amount || 0;
      
      // บันทึกเป็นค่าใช้จ่ายประเภทการบริจาค
      await this.cashFlowLogic.recordTransaction({
        playerInSessionId: playerId,
        transactionType: 'expense',
        amount: amount,
        category: 'charity',
        description: effectData.description || 'Charity donation',
        fromAccount: 'cash'
      });

      // เพิ่มคะแนนความสุข
      await this.prisma.playerInSession.update({
        where: { id: playerId },
        data: {
          happinessScore: {
            increment: Math.floor(amount / 1000) // 1 point per $1000 donated
          }
        }
      });

      // อัปเดตสถิติการบริจาค
      await this.playerStatsService.updatePersonalStats(playerId, {
        charitableDonations: 1,
        totalDonated: amount
      });

      return {
        success: true,
        message: `Donated $${amount} to charity`,
        effect: 'charity_donation',
        amount: amount,
        happinessBonus: Math.floor(amount / 1000)
      };
    } catch (error) {
      console.error('Error processing charity effect:', error);
      return {
        success: false,
        message: 'Error processing charity effect',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  /**
   * ประมวลผล effect ประเภทการเลือก
   */
  private async processChoiceEffect(playerId: number, effectData: any) {
    try {
      console.log(`Processing choice effect for player ${playerId}:`, effectData);
      
      return {
        success: true,
        message: 'Choice required',
        effect: 'choice_required',
        requiresChoice: true,
        choices: effectData.choices || [],
        choiceData: effectData
      };
    } catch (error) {
      console.error('Error processing choice effect:', error);
      return {
        success: false,
        message: 'Error processing choice effect',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * จัดการการเลือกจากผู้เล่น
   */
  async handlePlayerChoice(playerId: number, choiceData: any, selectedChoice: any) {
    try {
      console.log(`Processing player choice for player ${playerId}:`, selectedChoice);

      // ประมวลผลตามการเลือกของผู้เล่น
      if (selectedChoice.effect) {
        return await this.executeCardEffect(0, playerId, selectedChoice.effect);
      }

      return {
        success: true,
        message: 'Choice processed',
        effect: 'choice_processed',
        choice: selectedChoice
      };
    } catch (error) {
      console.error('Error handling player choice:', error);
      return {
        success: false,
        message: 'Error processing choice',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * ประมวลผล effect ทั่วไป
   */
  private processGenericEffect(playerId: number, effectData: any) {
    console.log(`Processing generic effect for player ${playerId}:`, effectData);
    
    return {
      success: true,
      message: 'Effect processed',
      effect: 'generic',
      data: effectData
    };
  }

  /**
   * จัดการ Charity effect (Updated - removed duplicate)
   */
  async processCharityDonation(playerId: number, charityId: number, amount: number) {
    // Use the new processCharityEffect method
    return await this.processCharityEffect(playerId, {
      amount: amount,
      description: `Charity donation to charity ${charityId}`,
      charityId: charityId
    });
  }

  /**
   * จัดการ Payday effect (Updated)
   */
  async processPaydayEffect(playerId: number, careerId?: number) {
    try {
      let salary = 0;
      let salaryDetails = {};
      
      if (careerId) {
        const career = await this.prisma.career.findUnique({
          where: { id: careerId }
        });
        
        if (career) {
          salary = Number(career.baseSalary);
          salaryDetails = {
            careerName: career.name,
            baseSalary: career.baseSalary
          };
          
          // ใช้ CashFlowLogic เพื่อบันทึกรายได้
          await this.cashFlowLogic.recordTransaction({
            playerInSessionId: playerId,
            transactionType: 'income',
            amount: salary,
            category: 'salary',
            description: `Salary from ${career.name}`,
            toAccount: 'cash'
          });

          // อัปเดตสถิติ
          await this.playerStatsService.updatePersonalStats(playerId, {
            salariesReceived: 1,
            totalSalaryEarned: salary
          });
        }
      }
      
      return {
        success: true,
        message: `Received salary of $${salary}`,
        effect: 'payday',
        amount: salary,
        details: salaryDetails
      };
    } catch (error) {
      console.error('Error processing payday:', error);
      return {
        success: false,
        message: 'Error processing payday',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}