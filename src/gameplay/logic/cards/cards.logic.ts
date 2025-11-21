import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class CardsLogic {
    constructor(private readonly prisma: PrismaService) {}

    //  สุ่มการ์ดแบบธรรมดา (เก่า) - เก็บไว้าสำหรับ fallback
    async drawRandomCard(cardType: string) {
        try {
            const cardCount = await this.prisma.card.count({
                where: { type: cardType }
            });

            if (cardCount === 0) {
                console.warn(`No cards of type ${cardType} found`);
                return null;
            }

            const randomSkip = Math.floor(Math.random() * cardCount);
            
            const cards = await this.prisma.card.findMany({
                where: { type: cardType },
                take: 1,
                skip: randomSkip
            });

            const drawnCard = cards[0];
            if (drawnCard) {
                console.log(`🎴 Drew card: "${drawnCard.title}" (${cardType})`);
            }

            return drawnCard || null;
        } catch (error) {
            console.error(`Error drawing ${cardType} card:`, error);
            return null;
        }
    }

    //  สุ่มการ์ดแบบอัจฉริยะ - คำนึงถึง Economic Condition และ Game Level
    async drawSmartCard(cardType: string, options: {
        economicCondition: string;  // 'Prosperity', 'Recession', 'Depression', 'Expansion'
        gameLevel: number;          // 1.1, 1.2, 2.1, etc.
        sessionId?: number;         // สำหรับ logging
    }) {
        try {
            console.log(`Drawing ${cardType} card for Economic: ${options.economicCondition}, Level: ${options.gameLevel}`);

            // 1. ลำดับความสำคัญการค้นหา: Economic + Level > Level only > Any
            let availableCards = [];

            // Priority 1: ตรงทั้ง Economic Condition และ Game Level
            if (['Market', 'Life Event'].includes(cardType)) {
                availableCards = await this.prisma.card.findMany({
                    where: {
                        type: cardType,
                        gamelevel: options.gameLevel,
                        economicCondition: options.economicCondition
                    }
                });
                
                if (availableCards.length > 0) {
                    console.log(` Found ${availableCards.length} cards matching both economic condition and level`);
                }
            }

            // Priority 2: ถ้าไม่เจอ ให้หาแค่ Game Level (สำหรับการ์ดที่มี economicCondition)
            if (availableCards.length === 0 && ['Market', 'Life Event'].includes(cardType)) {
                availableCards = await this.prisma.card.findMany({
                    where: {
                        type: cardType,
                        gamelevel: options.gameLevel
                    }
                });
                
                if (availableCards.length > 0) {
                    console.log(`No exact economic match, found ${availableCards.length} cards for level ${options.gameLevel}`);
                }
            }

            // Priority 3: สำหรับการ์ดที่ไม่มี economicCondition (Opportunity, Invest in Yourself, Luxury)
            if (availableCards.length === 0) {
                availableCards = await this.prisma.card.findMany({
                    where: {
                        type: cardType,
                        gamelevel: options.gameLevel
                    }
                });
                
                if (availableCards.length > 0) {
                    console.log(`Found ${availableCards.length} cards for level ${options.gameLevel}`);
                }
            }

            // Priority 4: Fallback - หาการ์ดทุกอันในประเภทนั้น
            if (availableCards.length === 0) {
                console.warn(`No cards found for level ${options.gameLevel}, using any level...`);
                
                availableCards = await this.prisma.card.findMany({
                    where: { type: cardType }
                });
            }

            if (availableCards.length === 0) {
                console.error(`No ${cardType} cards found at all!`);
                return null;
            }

            // 2. สุ่มการ์ดจากที่หาได้ (แบบเท่าๆ กัน ไม่ใช้ weight)
            const randomIndex = Math.floor(Math.random() * availableCards.length);
            const selectedCard = availableCards[randomIndex];

            if (selectedCard) {
                console.log(`Smart drew: "${selectedCard.title}" (${cardType}) - Economic: ${options.economicCondition}, Level: ${options.gameLevel}`);
                
                // 3. บันทึก Analytics (ถ้าต้องการ)
                if (options.sessionId) {
                    this.logCardDraw(options.sessionId, selectedCard.id, options);
                }
            }

            return selectedCard;
        } catch (error) {
            console.error(`Error in smart card drawing for ${cardType}:`, error);
            // Fallback to simple random
            return this.drawRandomCard(cardType);
        }
    }

    // บันทึกการสุ่มการ์ดเพื่อ Analytics (Optional)
    private async logCardDraw(sessionId: number, cardId: number, options: any) {
        try {
            console.log(` Logged card draw - Session: ${sessionId}, Card: ${cardId}, Economic: ${options.economicCondition}, Level: ${options.gameLevel}`);
            
            // TODO: สามารถเพิ่มโค้ดบันทึกลง database ได้ตรงนี้
            /*
            await this.prisma.cardDrawLog.create({
                data: {
                    sessionId,
                    cardId,
                    economicCondition: options.economicCondition,
                    gameLevel: options.gameLevel,
                    drawnAt: new Date()
                }
            });
            */
        } catch (error) {
            console.error('Error logging card draw:', error);
        }
    }

    // ฟังก์ชันสำหรับดึงข้อมูล Economic Condition ปัจจุบัน
    async getCurrentEconomicCondition(sessionId: number): Promise<string> {
        try {
            // TODO: ดึงจาก Economic System ที่จะสร้างภายหลัง
            // ตอนนี้ return default ไปก่อน
            
            // Mock data สำหรับทดสอบ
            const mockConditions = ['Prosperity', 'Recession', 'Depression', 'Expansion'];
            const randomCondition = mockConditions[Math.floor(Math.random() * mockConditions.length)];
            
            console.log(` Current Economic Condition: ${randomCondition}`);
            return randomCondition;
        } catch (error) {
            console.error('Error getting economic condition:', error);
            return 'Prosperity'; // Default fallback
        }
    }

    // ฟังก์ชันสำหรับดึง Game Level ปัจจุบัน
    async getCurrentGameLevel(sessionId: number): Promise<number> {
        try {
            const session = await this.prisma.session.findUnique({
                where: { id: sessionId },
                select: { gameLevel: true }
            });

            const level = session?.gameLevel || 1.1; // Default level
            console.log(`🎮 Current Game Level: ${level}`);
            return level;
        } catch (error) {
            console.error('Error getting game level:', error);
            return 1.1; // Default fallback
        }
    }

    // Main function ที่ Gameplay Service จะเรียกใช้
    async drawCardForSession(cardType: string, sessionId: number) {
        const economicCondition = await this.getCurrentEconomicCondition(sessionId);
        const gameLevel = await this.getCurrentGameLevel(sessionId);

        return this.drawSmartCard(cardType, {
            economicCondition,
            gameLevel,
            sessionId
        });
    }

    // จัดการโครงสร้างการ์ด Opportunity ตาม asset_category
    processOpportunityCard(card: any) {
        if (!card) return null;

        const assetCategory = card.effectData?.asset_category;

        if (assetCategory === 'สินทรัพย์หลัก') {
            return {
                type: 'opportunity',
                subType: 'main_asset',
                message: 'Drew an Opportunity card - Main Asset',
                card: {
                    id: card.id,
                    type: card.type,
                    title: card.title,
                    gamelevel: card.gamelevel,
                    description: card.description,
                    effectData: {
                        sysmbol: card.effectData?.sysmbol,
                        costtype: card.effectData?.costtype,
                        cost: card.effectData?.cost,
                        sellPrice: card.effectData?.sellPrice,
                        historicTradingRange: card.effectData?.historicTradingRange
                    },
                    Tips: card.Tips
                }
            };
        } else if (assetCategory === 'สินทรัพย์ทางเลือก') {
            return {
                type: 'opportunity',
                subType: 'alternative_asset',
                message: 'Drew an Opportunity card - Alternative Asset',
                card: {
                    id: card.id,
                    type: card.type,
                    title: card.title,
                    gamelevel: card.gamelevel,
                    description: card.description,
                    effectData: {
                        cost: card.effectData?.cost,
                        costtype: card.effectData?.costtype,
                        sellPrice: card.effectData?.sellPrice,
                        cashFlow: card.effectData?.cashFlow,
                        downPayment: card.effectData?.downPayment,
                        loanAmount: card.effectData?.loanAmount
                    },
                    Tips: card.Tips
                }
            };
        } else {
            return {
                type: 'opportunity',
                subType: 'other',
                message: 'Drew an Opportunity card',
                card: card
            };
        }
    }

    // manage card Market structure (แก้ไข syntax error)
    processMarketCard(card: any) {
        if (!card) return null;

        const economicCondition = card.economicCondition;

        switch (economicCondition) {
            case 'Prosperity':
                return {
                    type: 'market',
                    subType: 'prosperity',
                    message: 'Drew a Market card - Prosperity',
                    card: {
                        id: card.id,
                        type: card.type,
                        title: card.title,
                        gamelevel: card.gamelevel,
                        description: card.description,
                        effectData: {
                            effect: {
                                Type: card.effectData?.effect?.Type,
                                description: card.effectData?.effect?.description,
                                duration: card.effectData?.effect?.duration,
                                assets: card.effectData?.effect?.assets || []
                            }
                        },
                        Tips: card.Tips,
                        economicCondition: card.economicCondition
                    }
                };
                
            case 'Recession':
                return {
                    type: 'market',
                    subType: 'recession',
                    message: 'Drew a Market card - Recession',
                    card: {
                        id: card.id,
                        type: card.type,
                        title: card.title,
                        gamelevel: card.gamelevel,
                        description: card.description,
                        effectData: {
                            effect: {
                                Type: card.effectData?.effect?.Type,
                                description: card.effectData?.effect?.description,
                                duration: card.effectData?.effect?.duration,
                                assets: card.effectData?.effect?.assets || []
                            }
                        },
                        Tips: card.Tips,
                        economicCondition: card.economicCondition
                    }
                };
                
            case 'Depression':
                return {
                    type: 'market',
                    subType: 'depression',
                    message: 'Drew a Market card - Depression',
                    card: {
                        id: card.id,
                        type: card.type,
                        title: card.title,
                        gamelevel: card.gamelevel,
                        description: card.description,
                        effectData: {
                            effect: {
                                Type: card.effectData?.effect?.Type,
                                description: card.effectData?.effect?.description,
                                duration: card.effectData?.effect?.duration,
                                assets: card.effectData?.effect?.assets || []
                            }
                        },
                        Tips: card.Tips,
                        economicCondition: card.economicCondition
                    }
                };
                
            case 'Expansion':
                return {
                    type: 'market',
                    subType: 'expansion',
                    message: 'Drew a Market card - Expansion',
                    card: {
                        id: card.id,
                        type: card.type,
                        title: card.title,
                        gamelevel: card.gamelevel,
                        description: card.description,
                        effectData: {
                            effect: {
                                Type: card.effectData?.effect?.Type,
                                description: card.effectData?.effect?.description,
                                duration: card.effectData?.effect?.duration,
                                assets: card.effectData?.effect?.assets || []
                            }
                        },
                        Tips: card.Tips,
                        economicCondition: card.economicCondition
                    }
                };
                
            default:
                return {
                    type: 'market',
                    subType: 'other',
                    message: 'Drew a Market card',
                    card: card
                };
        }
    }

    // Invest in Yourself Card
    processInvestInYourselfCard(card: any) {
        if (!card) return null;
        
        return {
            type: 'invest_in_yourself',
            message: 'Drew an Invest in Yourself card',
            card: {
                id: card.id,
                type: card.type,
                title: card.title,
                gamelevel: card.gamelevel,
                description: card.description,
                effectData: {
                    cost: card.effectData?.cost,
                    category: card.effectData?.category,
                    effect: {
                        Type: card.effectData?.effect?.Type,
                        description: card.effectData?.effect?.description,
                        duration: card.effectData?.effect?.duration
                    }
                },
                Tips: card.Tips,
                statChanges: {
                    happiness: card.statChanges?.happiness,
                    health: card.statChanges?.health,
                    knowledge: card.statChanges?.knowledge,
                    connection: card.statChanges?.connection
                }
            }
        };
    }

    // Life Event Card (แก้ไข syntax error)
    processLifeEventCard(card: any) {
        if (!card) return null;
        
        const economicCondition = card.economicCondition;

        switch (economicCondition) {
            case 'Prosperity':
                return {
                    type: 'life_event',
                    subType: 'prosperity',
                    message: 'Drew a Life Event card - Prosperity',
                    card: {
                        id: card.id,
                        type: card.type,
                        title: card.title,
                        gamelevel: card.gamelevel,
                        description: card.description,
                        effectData: {
                            cost: card.effectData?.cost,
                            effect: {
                                Type: card.effectData?.effect?.Type,
                                description: card.effectData?.effect?.description,
                                duration: card.effectData?.effect?.duration,
                            }
                        },
                        Tips: card.Tips,
                        economicCondition: card.economicCondition,
                        statChanges: {
                            happiness: card.statChanges?.happiness,
                            health: card.statChanges?.health,
                            knowledge: card.statChanges?.knowledge,
                            connection: card.statChanges?.connection
                        }
                    }
                };
                
            case 'Recession':
                return {
                    type: 'life_event',
                    subType: 'recession',
                    message: 'Drew a Life Event card - Recession',
                    card: {
                        id: card.id,
                        type: card.type,
                        title: card.title,
                        gamelevel: card.gamelevel,
                        description: card.description,
                        effectData: {
                            cost: card.effectData?.cost,
                            effect: {
                                Type: card.effectData?.effect?.Type,
                                description: card.effectData?.effect?.description,
                                duration: card.effectData?.effect?.duration,
                            }
                        },
                        Tips: card.Tips,
                        economicCondition: card.economicCondition,
                        statChanges: {
                            happiness: card.statChanges?.happiness,
                            health: card.statChanges?.health,
                            knowledge: card.statChanges?.knowledge,
                            connection: card.statChanges?.connection
                        }
                    }
                };
                
            case 'Depression':
                return {
                    type: 'life_event',
                    subType: 'depression',
                    message: 'Drew a Life Event card - Depression',
                    card: {
                        id: card.id,
                        type: card.type,
                        title: card.title,
                        gamelevel: card.gamelevel,
                        description: card.description,
                        effectData: {
                            cost: card.effectData?.cost,
                            effect: {
                                Type: card.effectData?.effect?.Type,
                                description: card.effectData?.effect?.description,
                                duration: card.effectData?.effect?.duration,
                            }
                        },
                        Tips: card.Tips,
                        economicCondition: card.economicCondition,
                        statChanges: {
                            happiness: card.statChanges?.happiness,
                            health: card.statChanges?.health,
                            knowledge: card.statChanges?.knowledge,
                            connection: card.statChanges?.connection
                        }
                    }
                };
                
            case 'Expansion':
                return {
                    type: 'life_event',
                    subType: 'expansion',
                    message: 'Drew a Life Event card - Expansion',
                    card: {
                        id: card.id,
                        type: card.type,
                        title: card.title,
                        gamelevel: card.gamelevel,
                        description: card.description,
                        effectData: {
                            cost: card.effectData?.cost,
                            effect: {
                                Type: card.effectData?.effect?.Type,
                                description: card.effectData?.effect?.description,
                                duration: card.effectData?.effect?.duration,
                            }
                        },
                        Tips: card.Tips,
                        economicCondition: card.economicCondition,
                        statChanges: {
                            happiness: card.statChanges?.happiness,
                            health: card.statChanges?.health,
                            knowledge: card.statChanges?.knowledge,
                            connection: card.statChanges?.connection
                        }
                    }
                };
                
            default:
                return {
                    type: 'life_event',
                    subType: 'other',
                    message: 'Drew a Life Event card',
                    card: card
                };
        }
    }

    // Luxury Card
    processLuxuryCard(card: any) {
        if (!card) return null;
        
        return {
            type: 'luxury',
            message: 'Drew a Luxury card',
            card: {
                id: card.id,
                type: card.type,
                title: card.title,
                gamelevel: card.gamelevel,
                description: card.description,
                effectData: {
                    cost: card.effectData?.cost,
                    effect: {
                        Type: card.effectData?.effect?.Type,
                        description: card.effectData?.effect?.description,
                        duration: card.effectData?.effect?.duration
                    }
                },
                Tips: card.Tips,
                statChanges: {
                    happiness: card.statChanges?.happiness,
                    health: card.statChanges?.health,
                    knowledge: card.statChanges?.knowledge,
                    connection: card.statChanges?.connection
                }
            }
        };
    }

    // ดึงสถิติการ์ดทั้งหมด
    async getCardStatistics() {
        const totalCards = await this.prisma.card.count();
        const types = await this.prisma.card.groupBy({
            by: ['type'],
            _count: {
                type: true
            }
        });
        return { totalCards, types, typesCount: types.length };
    }
}