export interface EconomicCondition {
  id: string;
  name: string;
  description: string;
  type: 'bull_market' | 'bear_market' | 'recession' | 'boom' | 'stable';
  effects: EconomicEffect[];
  duration: number; // turns
  triggerConditions?: EconomicTrigger[];
}

export interface EconomicEffect {
  effectType: 'asset_price_change' | 'income_multiplier' | 'expense_multiplier' | 'interest_rate_change';
  targetType: 'all_assets' | 'specific_asset_type' | 'all_players' | 'specific_career';
  target?: string;
  modifier: number; // percentage or absolute value
  operation: 'multiply' | 'add' | 'subtract' | 'set';
}

export interface EconomicTrigger {
  triggerType: 'turn_count' | 'player_action' | 'random_chance' | 'market_condition';
  condition: any;
  probability?: number; // 0-1
}

export interface EconomicState {
  sessionId: number;
  currentCondition: EconomicCondition;
  conditionStartTurn: number;
  remainingDuration: number;
  priceMultipliers: { [assetType: string]: number };
  interestRates: {
    savings: number;
    debt: number;
  };
  nextConditionChange?: number;
}

export interface MarketUpdate {
  sessionId: number;
  assetPriceChanges: AssetPriceChange[];
  economicCondition: EconomicCondition;
  effectiveDate: Date;
  affectedPlayers: number[];
}

export interface AssetPriceChange {
  assetId: number;
  assetName: string;
  oldPrice: number;
  newPrice: number;
  changePercentage: number;
  reason: string;
}