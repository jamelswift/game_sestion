# Gameplay System Documentation

## ภาพรวม
ระบบ Gameplay ของเกม Finix Board Game ที่จัดการ Logic หลักของเกมทั้งหมด รวมถึงการทอยเต๋า, การ์ด, การจัดการผู้เล่น, และเงื่อนไขการชนะ

## โครงสร้างหลังการจัดระเบียบ

```
src/gameplay/
├── gameplay.service.ts        # ❤️ หัวใจหลักของระบบ - จัดการ Logic ทั้งหมด
├── gameplay.module.ts         # การกำหนดค่า Module และ Dependencies  
├── gameplay.gateway.ts        # WebSocket Gateway สำหรับ Real-time
├── dto/                       # Data Transfer Objects
└── logic/                     # Logic ย่อยแยกตาม Domain
    ├── cards/                 # 🎴 ระบบการ์ด
    ├── event/                 # 🎯 จัดการ Event ของการ์ด
    ├── financial/             # 💰 ระบบการเงิน (รวม Savings)
    ├── player/                # 👤 จัดการผู้เล่น
    ├── roll-dice/             # 🎲 ระบบทอยเต๋า
    └── win-condition/         # 🏆 เงื่อนไขการชนะ
```

## การจัดระเบียบที่ทำไป

### ❌ Folders ที่ลบออกเพราะซ้ำซ้อน
1. **`savings/`** - รวมเข้ากับ `financial/` แล้ว (SavingsManagementService)
2. **`economy/`** - โฟลเดอร์ว่างเปล่า
3. **`movement/`** - โฟลเดอร์ว่างเปล่า  
4. **`life/`** - โฟลเดอร์ว่างเปล่า
5. **`spaces/`** - โฟลเดอร์ว่างเปล่า
6. **`turn/`** - โฟลเดอร์ว่างเปล่า

### ✅ Folders ที่เก็บไว้และจัดระเบียบ
1. **`cards/`** - CardLoaderService สำหรับโหลดการ์ด
2. **`event/`** - CardEventHandler สำหรับจัดการ Logic การ์ด  
3. **`financial/`** - รวมระบบการเงินทั้งหมด (รวม Savings)
4. **`player/`** - PlayerManagerService
5. **`roll-dice/`** - DiceService พร้อม database integration
6. **`win-condition/`** - WinConditionService

---

## ระบบหลักและการทำงาน

### 🎲 **Dice System** 
**หน้าที่:** จัดการการทอยเต๋าและการเคลื่อนที่บนกระดาน

**Services:**
- `DiceService` - ทอยเต๋า, บันทึกประวัติ, สถิติ

**การทำงาน:**
```typescript
// 1. ทอยเต๋าใน Gameplay
const result = await gameplayService.handlePlayerRollDice(playerInSessionId);
// 2. DiceService จะ:
//    - ทอยเต๋า (1-6)
//    - บันทึก Activity ลง database
//    - คำนวณตำแหน่งใหม่บน board
//    - ดึงข้อมูลช่องที่ไปตก
```

**เชื่อมต่อกับ:**
- `prisma.playerInSession` - อัพเดทตำแหน่งผู้เล่น
- `prisma.boardSpace` - ดึงข้อมูลช่องบนกระดาน
- `prisma.activity` - บันทึกประวัติการทอย

---

### 🎴 **Card System**
**หน้าที่:** จัดการการ์ดและ Logic ของการ์ดแต่ละประเภท

**Services:**
- `CardLoaderService` - โหลดการ์ดจาก JSON files
- `CardEventHandler` - ดำเนินการตาม Logic ของการ์ด

**ประเภทการ์ด:**
- Opportunity Cards
- Market Cards  
- Invest in Yourself Cards
- Life Event Cards
- Luxury Cards

**การทำงาน:**
```typescript
// 1. สุ่มการ์ด
const card = gameplayService.drawRandomCard('Opportunity');

// 2. ดำเนินการตามการ์ด
const result = await gameplayService.executeCardEvent({
    playerId: 1,
    cardId: card.Card_id,
    decision: 'accept'
});
```

**เชื่อมต่อกับ:**
- `src/data-catalog/` - ไฟล์ JSON การ์ด
- `financial/` - เปลี่ยนแปลงสถานะทางการเงิน

---

### 💰 **Financial System** 
**หน้าที่:** จัดการระบบการเงินทั้งหมด (เงินสด, เงินออม, สินทรัพย์, หนี้)

**Services รวมใน financial/:**
- `SavingsManagementService` - เงินออม (ย้ายมาจาก savings/)
- `CashManagementService` - เงินสด
- `AssetManagementService` - สินทรัพย์
- `LoanSystemService` - หนี้สิน
- `FinancialCalculator` - คำนวณทางการเงิน
- `PlayerStatsService` - สถิติผู้เล่น

**การทำงาน:**
```typescript
// ออมเงิน
await gameplayService.saveMoney(playerId, 10000);

// ถอนเงินออม  
await gameplayService.withdrawSavings(playerId, 5000);

// ดูข้อมูลเงินออม
const savingsInfo = gameplayService.getPlayerSavingsInfo(playerId);
```

**เชื่อมต่อกับ:**
- `player/PlayerManagerService` - อัพเดทสถานะผู้เล่น
- การ์ดต่างๆ ที่มีผลกระทบทางการเงิน

---

### 👤 **Player Management System**
**หน้าที่:** จัดการสถานะและข้อมูลผู้เล่น

**Services:**
- `PlayerManagerService` - CRUD ผู้เล่น, จัดการสถานะ

**การทำงาน:**
```typescript
// ดึงข้อมูลผู้เล่น
const player = gameplayService.getPlayer(playerId);

// อัพเดทสถานะ
gameplayService.updatePlayerState(playerId, {
    cash: 50000,
    savings: 20000
});
```

**เชื่อมต่อกับ:**
- ทุกระบบที่ต้องเข้าถึงข้อมูลผู้เล่น

---

### 🏆 **Win Condition System**  
**หน้าที่:** ตรวจสอบเงื่อนไขการชนะและความก้าวหน้า

**Services:**
- `WinConditionService` - ตรวจสอบการชนะ, คำนวณความก้าวหน้า

**เงื่อนไขการชนะ:**
- เงินเย็น (เงินออม + การลงทุน) ≥ 100,000 บาท

**การทำงาน:**
```typescript
// ตรวจสอบการชนะ
const winResult = await gameplayService.checkWinCondition(playerId);

// ดูความก้าวหน้า
const progress = await gameplayService.getProgressPercentage(playerId);
```

**เชื่อมต่อกับ:**
- `financial/` - คำนวณสินทรัพย์รวม
- `player/` - ดึงข้อมูลผู้เล่น

---

## การเชื่อมต่อระหว่างระบบ

### 🔄 **การไหลของข้อมูลหลัก:**

1. **ผู้เล่นทอยเต๋า**
   ```
   Client → GameplayGateway → GameplayService.handlePlayerRollDice()
   ↓
   DiceService.rollForGameplay() → Database (Activity)
   ↓  
   คำนวณตำแหน่งใหม่ → BoardSpace → Card Event (ถ้ามี)
   ↓
   CardEventHandler → FinancialSystem → PlayerState Update
   ```

2. **การจัดการการ์ด**
   ```
   Card Draw → CardLoaderService.drawRandomCardByType()
   ↓
   Player Decision → CardEventHandler.executeCardEvent()
   ↓
   FinancialSystem Update → PlayerManagerService.updatePlayerState()
   ↓
   WinConditionService.checkWinCondition()
   ```

### 🏗️ **Architecture Pattern:**
- **Service Layer Pattern** - แยก Logic ตาม Domain
- **Dependency Injection** - ใช้ NestJS DI Container
- **Database Integration** - Prisma ORM สำหรับ Data Persistence
- **Real-time Communication** - WebSocket Gateway

---

## การใช้งาน GameplayService

### 📋 **API Methods หลัก:**

```typescript
// === DICE SYSTEM ===
await handlePlayerRollDice(playerInSessionId, forcedResult?, config?)
await rollDiceForTesting(playerId, config?)
await getDiceStatistics(playerId)
await getDiceHistory(playerId)

// === CARD SYSTEM ===
getCardsByType(cardType)
getAllCards()
drawRandomCard(cardType)
findCardById(cardId)
await executeCardEvent(decision)

// === PLAYER MANAGEMENT ===
getPlayer(playerId)
updatePlayerState(playerId, newState)

// === WIN CONDITION ===
await checkWinCondition(playerId)
await checkAllPlayersWinCondition()
await getProgressPercentage(playerId)

// === SAVINGS SYSTEM ===
await saveMoney(playerId, amount)
await withdrawSavings(playerId, amount)
getPlayerSavingsInfo(playerId)
```

---

## Database Integration

### 📊 **ตารางที่เกี่ยวข้อง:**
- `PlayerInSession` - สถานะผู้เล่นในเกม
- `BoardSpace` - ข้อมูลช่องบนกระดาน
- `Activity` - ประวัติการทำงานทั้งหมด
- `User` - ข้อมูลผู้เล่นพื้นฐาน
- `GameSession` - ข้อมูลเซสชันเกม

### 🔗 **การเชื่อมต่อ:**
- ทุก Service ใช้ `PrismaService` สำหรับ Database Operations
- Activity Logging ทำงานอัตโนมัติในทุก Action สำคัญ
- Real-time Updates ผ่าน WebSocket Gateway

---

## สรุปการปรับปรุง

### ✅ **ผลลัพธ์ที่ได้:**
1. **ลดความซ้ำซ้อน** - รวม Savings เข้า Financial, ลบ folders ว่าง
2. **จัดระเบียบโครงสร้าง** - แยก Logic ตาม Domain ชัดเจน  
3. **เพิ่มประสิทธิภาพ** - รวม Services ใน GameplayService เป็น Single Entry Point
4. **เตรียมความพร้อมการพัฒนา** - โครงสร้างที่ชัดเจน, ง่ายต่อการขยาย

### 🎯 **ข้อดี:**
- **Maintainability** - โค้ดง่ายต่อการดูแล
- **Scalability** - สามารถเพิ่ม Feature ใหม่ได้ง่าย  
- **Testability** - แยก Logic ชัดเจน ทำ Unit Test ได้ดี
- **Performance** - ลด Code Duplication, เพิ่มความเร็ว

---

**📅 สร้างเมื่อ:** 14 October 2025  
**👨‍💻 โดย:** Gameplay System Refactoring  
**🎮 สำหรับ:** Finix Board Game Backend