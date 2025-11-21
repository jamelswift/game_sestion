// back-end/src/enums/icard-phase.enum.ts
// ประเภทของการ์ดในเกม
export enum CardType {
    OPPORTUNITY = 'Opportunity',
    MARKET = 'Market',
    INVEST_IN_YOURSELF = 'Invest in Yourself',
    LIFE_EVENT = 'Life Event',
    LUXURY = 'Luxury',
    CHARITY = 'Charity',
}

// ประเภทของราคาการ์ดสินทรัพย์
export enum CostType {
    FIXED = 'Fixed',
    DYNAMIC = 'Dynamic'
}

// ประเภทผลกระทบของการ์ด
export enum EffectType {
    CASH_INCREASE = 'เงินสดเพิ่ม',
    CASH_DECREASE = 'เงินสดลด',
    CASHFLOW_INCREASE = 'Cashflow เพิ่ม',
    HAPPINESS_INCREASE = 'ความสุขเพิ่ม',
    RANDOM_CASH = 'เงินสดเพิ่ม (สุ่ม)'
}

// ระยะเวลาของผลกระทบ
export enum EffectDuration {
    IMMEDIATE = 'ทันที',
    PERMANENT = 'ถาวร',
    TEMPORARY = 'ชั่วคราว'
}

// สภาวะเศรษฐกิจ
export enum EconomicCondition {
    PROSPERITY = 'Prosperity',
    RECESSION = 'Recession',
    DEPRESSION = 'Depression',
    EXPANSION = 'Expansion'  
}

// ส่งออก enum ทั้งหมดในออบเจ็กต์เดียว
export default {
    CardType,
    CostType,
    EffectType,
    EffectDuration,
    EconomicCondition
}