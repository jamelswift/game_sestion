import { PrismaService } from '../../../prisma/prisma.service';

// ============================================================================
// Player Stats Interfaces
// ============================================================================
export interface PersonalStats {
  happinessScore: number;     // 0-100
  healthScore: number;        // 0-100
  learningScore: number;      // 0-100
  relationshipScore: number;  // 0-100
}

export interface FinancialSkillStats {
  riskScore: number;          // 0-100
  creditScore: number;        // 0-100
  savingScore: number;        // 0-100
  investingScore: number;     // 0-100
  debtMgmtScore: number;      // 0-100
  spendingScore: number;      // 0-100
  incomeMgmtScore: number;    // 0-100
}

export interface AllPlayerStats extends PersonalStats, FinancialSkillStats {}

export interface StatChange {
  // Personal Stats
  happiness?: number;
  health?: number;
  learning?: number;
  relationship?: number;
  
  // Financial Skills
  risk?: number;
  credit?: number;
  saving?: number;
  investing?: number;
  debtMgmt?: number;
  spending?: number;
  incomeMgmt?: number;
}

export interface StatsAnalysis {
  overall: 'Poor' | 'Fair' | 'Good' | 'Excellent';
  score: number;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  healthWarnings: string[];
}

export interface StatsGoal {
  targetStats: Partial<AllPlayerStats>;
  priority: 'high' | 'medium' | 'low';
  timeframe: 'short_term' | 'medium_term' | 'long_term';
  rewards?: {
    cash?: number;
    happiness?: number;
    description: string;
  };
}

// ============================================================================
// Player Stats Service
// ============================================================================
export class PlayerStatsService {
  constructor(private readonly prisma: PrismaService) {}

  // ========================================
  // 📊 Core Stats Methods
  // ========================================

  /**
   * ดึงสถิติปัจจุบันของผู้เล่น
   */
  async getPlayerStats(playerInSessionId: number): Promise<AllPlayerStats | null> {
    try {
      const player = await this.prisma.playerInSession.findUnique({
        where: { id: playerInSessionId }
      });

      if (!player) return null;

      return {
        // Personal Stats
        happinessScore: player.happinessScore,
        healthScore: player.healthScore,
        learningScore: player.learningScore,
        relationshipScore: player.relationshipScore,
        
        // Financial Skills
        riskScore: player.riskScore,
        creditScore: player.creditScore,
        savingScore: player.savingScore,
        investingScore: player.investingScore,
        debtMgmtScore: player.debtMgmtScore,
        spendingScore: player.spendingScore,
        incomeMgmtScore: player.incomeMgmtScore
      };
    } catch (error) {
      console.error('Error getting player stats:', error);
      return null;
    }
  }

  /**
   * อัปเดตสถิติผู้เล่น
   */
  async updatePlayerStats(playerInSessionId: number, changes: StatChange): Promise<AllPlayerStats | null> {
    try {
      // ดึงค่าปัจจุบัน
      const currentStats = await this.getPlayerStats(playerInSessionId);
      if (!currentStats) return null;

      // คำนวณค่าใหม่
      const newStats = this.calculateNewStats(currentStats, changes);

      // อัปเดตในฐานข้อมูล
      await this.prisma.playerInSession.update({
        where: { id: playerInSessionId },
        data: {
          // Personal Stats
          happinessScore: newStats.happinessScore,
          healthScore: newStats.healthScore,
          learningScore: newStats.learningScore,
          relationshipScore: newStats.relationshipScore,
          
          // Financial Skills
          riskScore: newStats.riskScore,
          creditScore: newStats.creditScore,
          savingScore: newStats.savingScore,
          investingScore: newStats.investingScore,
          debtMgmtScore: newStats.debtMgmtScore,
          spendingScore: newStats.spendingScore,
          incomeMgmtScore: newStats.incomeMgmtScore
        }
      });

      console.log(`📈 Player ${playerInSessionId} stats updated:`, changes);
      return newStats;
    } catch (error) {
      console.error('Error updating player stats:', error);
      return null;
    }
  }

  /**
   * รีเซ็ตสถิติเป็นค่าเริ่มต้น
   */
  async resetPlayerStats(playerInSessionId: number): Promise<AllPlayerStats | null> {
    try {
      const defaultStats = this.getDefaultStats();
      
      await this.prisma.playerInSession.update({
        where: { id: playerInSessionId },
        data: {
          // Personal Stats
          happinessScore: defaultStats.happinessScore,
          healthScore: defaultStats.healthScore,
          learningScore: defaultStats.learningScore,
          relationshipScore: defaultStats.relationshipScore,
          
          // Financial Skills
          riskScore: defaultStats.riskScore,
          creditScore: defaultStats.creditScore,
          savingScore: defaultStats.savingScore,
          investingScore: defaultStats.investingScore,
          debtMgmtScore: defaultStats.debtMgmtScore,
          spendingScore: defaultStats.spendingScore,
          incomeMgmtScore: defaultStats.incomeMgmtScore
        }
      });

      console.log(`🔄 Player ${playerInSessionId} stats reset to default`);
      return defaultStats;
    } catch (error) {
      console.error('Error resetting player stats:', error);
      return null;
    }
  }

  // ========================================
  // 🧮 Analysis Methods
  // ========================================

  /**
   * วิเคราะห์สถิติผู้เล่น
   */
  async analyzePlayerStats(playerInSessionId: number): Promise<StatsAnalysis | null> {
    try {
      const stats = await this.getPlayerStats(playerInSessionId);
      if (!stats) return null;

      return this.performStatsAnalysis(stats);
    } catch (error) {
      console.error('Error analyzing player stats:', error);
      return null;
    }
  }

  /**
   * ตรวจสอบสุขภาพโดยรวมของสถิติ
   */
  isStatsHealthy(stats: AllPlayerStats): boolean {
    const criticalStats = [
      stats.happinessScore,
      stats.healthScore,
      stats.creditScore
    ];

    // ถ้ามีค่าใดต่ำกว่า 20 ถือว่าไม่แข็งแรง
    return !criticalStats.some(stat => stat < 20);
  }

  /**
   * แนะนำการปรับปรุงสถิติ
   */
  getStatsRecommendations(stats: AllPlayerStats): string[] {
    const recommendations: string[] = [];

    // Personal Stats Recommendations
    if (stats.happinessScore < 30) {
      recommendations.push("💡 ควรหาวิธีเพิ่มความสุข เช่น การลงทุนในประสบการณ์หรือการพักผ่อน");
    }
    if (stats.healthScore < 30) {
      recommendations.push("🏥 ควรใส่ใจสุขภาพมากขึ้น เช่น การออกกำลังกายหรือตรวจสุขภาพ");
    }
    if (stats.learningScore < 40) {
      recommendations.push("📚 ควรลงทุนในการเรียนรู้เพื่อพัฒนาทักษะและเพิ่มโอกาสรายได้");
    }
    if (stats.relationshipScore < 40) {
      recommendations.push("👥 ควรสร้างและรักษาความสัมพันธ์ที่ดีกับผู้อื่น");
    }

    // Financial Skills Recommendations
    if (stats.creditScore < 50) {
      recommendations.push("💳 ควรปรับปรุงคะแนนเครดิต โดยชำระหนี้ตามกำหนด");
    }
    if (stats.savingScore < 40) {
      recommendations.push("🏦 ควรเพิ่มการออมเงินเพื่อสร้างฐานการเงินที่แข็งแรง");
    }
    if (stats.investingScore < 40) {
      recommendations.push("📈 ควรเรียนรู้และเริ่มลงทุนเพื่อสร้างรายได้เฉื่อย");
    }
    if (stats.debtMgmtScore < 40) {
      recommendations.push("💰 ควรปรับปรุงการจัดการหนี้ และมีแผนชำระหนี้ที่ชัดเจน");
    }
    if (stats.spendingScore < 40) {
      recommendations.push("🛒 ควรควบคุมการใช้จ่ายให้อยู่ในงบประมาณ");
    }
    if (stats.incomeMgmtScore < 40) {
      recommendations.push("💼 ควรหาวิธีเพิ่มรายได้หรือจัดการรายได้ให้ดีขึ้น");
    }

    return recommendations;
  }

  /**
   * สร้างเป้าหมายสถิติ
   */
  generateStatsGoals(stats: AllPlayerStats): StatsGoal[] {
    const goals: StatsGoal[] = [];

    // เป้าหมายระยะสั้น
    if (stats.savingScore < 60) {
      goals.push({
        targetStats: { savingScore: stats.savingScore + 20 },
        priority: 'high',
        timeframe: 'short_term',
        rewards: {
          cash: 1000,
          happiness: 5,
          description: 'โบนัสการออมเงิน'
        }
      });
    }

    // เป้าหมายระยะกลาง
    if (stats.investingScore < 70) {
      goals.push({
        targetStats: { investingScore: stats.investingScore + 30 },
        priority: 'medium',
        timeframe: 'medium_term',
        rewards: {
          happiness: 10,
          description: 'ความภาคภูมิใจในการลงทุน'
        }
      });
    }

    // เป้าหมายระยะยาว
    goals.push({
      targetStats: {
        happinessScore: Math.min(100, stats.happinessScore + 40),
        healthScore: Math.min(100, stats.healthScore + 40),
        creditScore: Math.min(100, stats.creditScore + 30)
      },
      priority: 'high',
      timeframe: 'long_term',
      rewards: {
        cash: 10000,
        happiness: 20,
        description: 'การเงินและชีวิตที่สมดุล'
      }
    });

    return goals;
  }

  // ========================================
  // 🔧 Helper Methods
  // ========================================

  /**
   * คำนวณค่าสถิติใหม่
   */
  private calculateNewStats(current: AllPlayerStats, changes: StatChange): AllPlayerStats {
    const newStats = { ...current };

    // อัปเดตแต่ละค่า โดยจำกัดให้อยู่ในช่วง 0-100
    if (changes.happiness !== undefined) {
      newStats.happinessScore = this.clampValue(current.happinessScore + changes.happiness);
    }
    if (changes.health !== undefined) {
      newStats.healthScore = this.clampValue(current.healthScore + changes.health);
    }
    if (changes.learning !== undefined) {
      newStats.learningScore = this.clampValue(current.learningScore + changes.learning);
    }
    if (changes.relationship !== undefined) {
      newStats.relationshipScore = this.clampValue(current.relationshipScore + changes.relationship);
    }
    if (changes.risk !== undefined) {
      newStats.riskScore = this.clampValue(current.riskScore + changes.risk);
    }
    if (changes.credit !== undefined) {
      newStats.creditScore = this.clampValue(current.creditScore + changes.credit);
    }
    if (changes.saving !== undefined) {
      newStats.savingScore = this.clampValue(current.savingScore + changes.saving);
    }
    if (changes.investing !== undefined) {
      newStats.investingScore = this.clampValue(current.investingScore + changes.investing);
    }
    if (changes.debtMgmt !== undefined) {
      newStats.debtMgmtScore = this.clampValue(current.debtMgmtScore + changes.debtMgmt);
    }
    if (changes.spending !== undefined) {
      newStats.spendingScore = this.clampValue(current.spendingScore + changes.spending);
    }
    if (changes.incomeMgmt !== undefined) {
      newStats.incomeMgmtScore = this.clampValue(current.incomeMgmtScore + changes.incomeMgmt);
    }

    return newStats;
  }

  /**
   * จำกัดค่าให้อยู่ในช่วง 0-100
   */
  private clampValue(value: number): number {
    return Math.min(100, Math.max(0, Math.round(value)));
  }

  /**
   * ค่าเริ่มต้นของสถิติ
   */
  private getDefaultStats(): AllPlayerStats {
    return {
      // Personal Stats (เริ่มต้นปานกลาง)
      happinessScore: 0,
      healthScore: 0,
      learningScore: 0,
      relationshipScore: 0,
      
      // Financial Skills (เริ่มต้นตามความเป็นจริง)
      riskScore: 0,
      creditScore: 0,     // เครดิตดีพอสมควร
      savingScore: 0,     // ออมเงินน้อย
      investingScore: 0,  // ลงทุนน้อยมาก
      debtMgmtScore: 0,   // จัดการหนี้ปานกลาง
      spendingScore: 0,   // การใช้จ่ายปานกลาง
      incomeMgmtScore: 0  // จัดการรายได้ยังไม่ดี
    };
  }

  /**
   * วิเคราะห์สถิติโดยละเอียด
   */
  private performStatsAnalysis(stats: AllPlayerStats): StatsAnalysis {
    // คำนวณคะแนนรวม
    const allValues = Object.values(stats);
    const totalScore = allValues.reduce((sum, score) => sum + score, 0);
    const averageScore = totalScore / allValues.length;

    // จำแนกระดับ
    let overall: 'Poor' | 'Fair' | 'Good' | 'Excellent';
    if (averageScore >= 80) overall = 'Excellent';
    else if (averageScore >= 60) overall = 'Good';
    else if (averageScore >= 40) overall = 'Fair';
    else overall = 'Poor';

    // หาจุดแข็ง
    const strengths: string[] = [];
    if (stats.happinessScore >= 70) strengths.push('มีความสุขดี 😊');
    if (stats.healthScore >= 70) strengths.push('สุขภาพแข็งแรง 💪');
    if (stats.creditScore >= 70) strengths.push('เครดิตดี 💳');
    if (stats.savingScore >= 70) strengths.push('ออมเงินเก่ง 🏦');
    if (stats.investingScore >= 70) strengths.push('ลงทุนเก่ง 📈');
    if (stats.learningScore >= 70) strengths.push('รักการเรียนรู้ 📚');

    // หาจุดอ่อน
    const weaknesses: string[] = [];
    if (stats.happinessScore < 40) weaknesses.push('ความสุขต่ำ 😟');
    if (stats.healthScore < 40) weaknesses.push('สุขภาพไม่ดี 🏥');
    if (stats.creditScore < 50) weaknesses.push('เครดิตไม่ดี ⚠️');
    if (stats.savingScore < 40) weaknesses.push('ออมเงินน้อย 💸');
    if (stats.debtMgmtScore < 40) weaknesses.push('จัดการหนี้ไม่ดี 💰');
    if (stats.spendingScore < 40) weaknesses.push('ใช้จ่ายไม่เป็น 🛒');

    // คำเตือนสุขภาพ
    const healthWarnings: string[] = [];
    if (stats.happinessScore < 20) healthWarnings.push('⚠️ ความสุขต่ำมาก ต้องการความช่วยเหลือ');
    if (stats.healthScore < 20) healthWarnings.push('⚠️ สุขภาพแย่มาก ควรไปพบแพทย์');
    if (stats.creditScore < 30) healthWarnings.push('⚠️ เครดิตแย่มาก อาจกู้เงินไม่ได้');

    return {
      overall,
      score: Math.round(averageScore),
      strengths,
      weaknesses,
      recommendations: this.getStatsRecommendations(stats),
      healthWarnings
    };
  }
}