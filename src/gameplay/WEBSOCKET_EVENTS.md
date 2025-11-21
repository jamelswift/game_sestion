# WebSocket Events Documentation

## ภาพรวม
เอกสารนี้อธิบาย WebSocket Events ทั้งหมดที่ใช้ใน `GameplayGateway` สำหรับการสื่อสารแบบ Real-time ระหว่าง Client และ Server

## Connection
- **Namespace:** `/gameplay`
- **CORS:** อนุญาตทุก origin (สำหรับการพัฒนา)

---

## 🎲 Dice System Events

### `rollDice` (Client → Server)
ทอยเต๋าและเคลื่อนที่บนกระดาน

**Request:**
```typescript
{
  playerInSessionId: number;
  sessionId: string;
  forcedResult?: number;          // บังคับผลลัพธ์ (สำหรับ testing)
  animationConfig?: {
    duration: number;
    sound: boolean;
    animation: 'basic' | 'bouncy' | 'spin';
  };
}
```

**Response Events:**
- `gameStateUpdate` → ส่งให้ทุกคนในห้อง
- `diceRolled` → ส่งให้ทุกคนในห้อง  
- `gameWon` → ถ้ามีคนชนะ

### `getDiceHistory` (Client → Server)
ดึงประวัติการทอยเต๋าของผู้เล่น

**Request:**
```typescript
{
  playerId: string;
}
```

**Response:**
- `diceHistory` → ส่งให้ client ที่ขอ

### `getDiceStatistics` (Client → Server)
ดึงสถิติการทอยเต๋าของผู้เล่น

**Request:**
```typescript
{
  playerId: string;
}
```

**Response:**
- `diceStatistics` → ส่งให้ client ที่ขอ

---

## 🎴 Card System Events

### `drawCard` (Client → Server)
จั่วการ์ดแบบสุ่มตามประเภท

**Request:**
```typescript
{
  sessionId: string;
  cardType: string;              // 'Opportunity', 'Market', 'Life Event', etc.
  playerId: string;
}
```

**Response:**
- `cardDrawn` → ส่งให้ทุกคนในห้อง

### `executeCardEvent` (Client → Server)
ดำเนินการตาม Logic ของการ์ด

**Request:**
```typescript
{
  sessionId: string;
  decision: {
    playerId: number;
    cardId: string;
    decision: 'accept' | 'reject' | 'buy' | 'sell' | 'invest';
    amount?: number;
    quantity?: number;
    selectedOption?: string;
  };
}
```

**Response:**
- `cardEventExecuted` → ส่งให้ทุกคนในห้อง
- `gameWon` → ถ้ามีคนชนะหลังการ์ดทำงาน

---

## 💰 Financial System Events

### `saveMoney` (Client → Server)
ออมเงิน (ย้ายเงินสดไปเงินออม)

**Request:**
```typescript
{
  sessionId: string;
  playerId: string;
  amount: number;
}
```

**Response:**
- `moneyTransactionUpdate` → ส่งให้ทุกคนในห้อง

### `withdrawSavings` (Client → Server)
ถอนเงินออม (ย้ายเงินออมกลับเป็นเงินสด)

**Request:**
```typescript
{
  sessionId: string;
  playerId: string;
  amount: number;
}
```

**Response:**
- `moneyTransactionUpdate` → ส่งให้ทุกคนในห้อง

### `getPlayerSavingsInfo` (Client → Server)
ดึงข้อมูลเงินออมของผู้เล่น

**Request:**
```typescript
{
  playerId: string;
}
```

**Response:**
- `playerSavingsInfo` → ส่งให้ client ที่ขอ

---

## 🏆 Win Condition Events

### `checkWinCondition` (Client → Server)
ตรวจสอบเงื่อนไขการชนะของผู้เล่นคนหนึ่ง

**Request:**
```typescript
{
  sessionId: string;
  playerId: string;
}
```

**Response:**
- `winConditionResult` → ส่งให้ client ที่ขอ
- `gameWon` → ถ้าผู้เล่นชนะ

### `getProgressPercentage` (Client → Server)
ดึงความคืบหน้าไปสู่เป้าหมายเป็นเปอร์เซ็นต์

**Request:**
```typescript
{
  playerId: string;
}
```

**Response:**
- `progressPercentage` → ส่งให้ client ที่ขอ

### `checkAllWinConditions` (Client → Server)
ตรวจสอบเงื่อนไขการชนะของทุกคน

**Request:**
```typescript
{
  sessionId: string;
}
```

**Response:**
- `allWinConditions` → ส่งให้ทุกคนในห้อง

---

## 👤 Player Management Events

### `getPlayerInfo` (Client → Server)
ดึงข้อมูลผู้เล่น

**Request:**
```typescript
{
  playerId: number;
}
```

**Response:**
- `playerInfo` → ส่งให้ client ที่ขอ

---

## 📡 Server Response Events

### `gameStateUpdate`
อัพเดทสถานะเกมทั่วไป

**Payload:**
```typescript
{
  diceResult?: DiceRollResult;
  player?: PlayerState;
  landedSpace?: BoardSpace;
  newPosition?: number;
  winCondition?: WinConditionResult;
  timestamp: string;
}
```

### `cardDrawn`
แจ้งว่ามีการจั่วการ์ด

**Payload:**
```typescript
{
  playerId: string;
  card: IGameCard;
  timestamp: string;
}
```

### `cardEventExecuted`
แจ้งผลลัพธ์การดำเนินการของการ์ด

**Payload:**
```typescript
{
  decision: PlayerDecision;
  result: CardExecutionResult;
  timestamp: string;
}
```

### `moneyTransactionUpdate`
แจ้งการทำธุรกรรมทางการเงิน

**Payload:**
```typescript
{
  type: 'save' | 'withdraw';
  playerId: string;
  result: SavingsTransactionResult;
  timestamp: string;
}
```

### `gameWon`
แจ้งว่ามีผู้เล่นชนะแล้ว

**Payload:**
```typescript
{
  winner: WinConditionResult;
  gameEndTime: string;
}
```

### `notification`
ข้อความแจ้งเตือนทั่วไป

**Payload:**
```typescript
{
  message: string;
  type: 'info' | 'warning' | 'error';
  timestamp: string;
}
```

### `error`
ข้อความผิดพลาด

**Payload:**
```typescript
{
  event: string;
  message: string;
  timestamp: string;
}
```

---

## 🛠️ Utility Methods

### `broadcastGameUpdate(sessionId, updateData)`
ส่งอัพเดทสถานะเกมให้ทุกคนในห้อง

### `broadcastNotification(sessionId, message, type)`
ส่งข้อความแจ้งเตือนให้ทุกคนในห้อง

---

## 🔄 Event Flow Examples

### การทอยเต๋าปกติ:
```
Client → rollDice
Server → gameStateUpdate (to all in session)
Server → diceRolled (to all in session)
[Optional] Server → gameWon (if someone wins)
```

### การจั่วและใช้การ์ด:
```
Client → drawCard
Server → cardDrawn (to all in session)
Client → executeCardEvent
Server → cardEventExecuted (to all in session)
[Optional] Server → gameWon (if card causes win)
```

### การออมเงิน:
```
Client → saveMoney
Server → moneyTransactionUpdate (to all in session)
```

---

## 🔒 Error Handling

ทุก Event Handler มี try-catch และจะส่ง `error` event กลับไปหาก:
- มี Exception เกิดขึ้น
- ข้อมูลที่ส่งมาไม่ถูกต้อง
- Player หรือ Session ไม่พบ

Error Response จะมีรูปแบบ:
```typescript
{
  event: string;        // ชื่อ event ที่เกิดข้อผิดพลาด
  message: string;      // ข้อความผิดพลาด
  timestamp: string;    // เวลาที่เกิดข้อผิดพลาด
}
```

---

**📅 สร้างเมื่อ:** 14 October 2025  
**👨‍💻 โดย:** GameplayGateway Enhancement  
**🎮 สำหรับ:** Finix Board Game Real-time Communication