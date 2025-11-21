import { Module } from '@nestjs/common';
import { GameplayService } from './gameplay.service';
import { GameplayGateway } from './gameplay.gateway';
import { GameplayController } from './gameplay.controller'; // 🆕 Add REST Controller
import { PrismaModule } from '../prisma/prisma.module';

// Import logic services
import { CardsLogic } from './logic/cards/cards.logic';
import { CardEffectLogic } from './logic/cards/effect.card.logic';
import { PlayerLogic } from './logic/player/player.logic';
import { MovementLogic } from './logic/movement/movement.logic';
import { EconomicConditionLogic } from './logic/economic/economic-condition.logic';

// Import Choice System
import { ChoiceSystemModule } from './logic/choice-system';

// Import Market Price System
import { MarketPriceSystemModule } from './logic/price-system/price-system.module';

@Module({
  imports: [
    PrismaModule, // Import PrismaModule to use PrismaService
    ChoiceSystemModule, // 🎯 Choice System for player decisions
    MarketPriceSystemModule, // 💰 Market Price System for dynamic asset pricing
  ],
  controllers: [
    GameplayController, // 🆕 REST API Controller
  ],
  providers: [
    GameplayService, 
    GameplayGateway,
    // Core logic services - single instances for dependency injection
    CardsLogic,
    CardEffectLogic,
    PlayerLogic,
    MovementLogic,
    EconomicConditionLogic,
  ],
  exports: [
    GameplayService,
    // Export logic services for use in other modules
    CardsLogic,
    CardEffectLogic,
    PlayerLogic,
    MovementLogic,
    EconomicConditionLogic,
  ],
})

export class GameplayModule {}