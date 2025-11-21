# ระบบ Authentication สำหรับ Finix Game

## ภาพรวม
ระบบ Authentication ของ Finix Game รองรับการลงทะเบียนและเข้าสู่ระบบสำหรับผู้เล่น โดยใช้ JWT (JSON Web Token) สำหรับการจัดการ session และการยืนยันตัวตน

## โครงสร้างไฟล์
```
src/auth/
├── auth.controller.ts    # API endpoints สำหรับ authentication
├── auth.service.ts       # Business logic สำหรับ authentication
├── auth.module.ts        # Module configuration
├── auth.md              # เอกสารนี้
├── dto/
│   ├── register-player.dto.ts  # DTO สำหรับการลงทะเบียน
│   └── login-player.dto.ts     # DTO สำหรับการเข้าสู่ระบบ
└── strategies/
    └── jwt.strategy.ts    # JWT strategy สำหรับ Passport
```

## API Endpoints

### 1. ลงทะเบียนผู้เล่นใหม่
**POST** `/auth/register`

#### Request Body
```json
{
  "email": "player@example.com",
  "password": "strongPassword123",
  "displayName": "ชื่อผู้เล่น"
}
```

#### Response (201 Created)
```json
{
  "message": "ลงทะเบียนสำเร็จ",
  "user": {
    "id": 1,
    "email": "player@example.com",
    "displayName": "ชื่อผู้เล่น",
    "createdAt": "2023-10-01T10:00:00Z",
    "updatedAt": "2023-10-01T10:00:00Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### 2. เข้าสู่ระบบ
**POST** `/auth/login`

#### Request Body
```json
{
  "email": "player@example.com",
  "password": "strongPassword123"
}
```

#### Response (200 OK)
```json
{
  "message": "เข้าสู่ระบบสำเร็จ",
  "user": {
    "id": 1,
    "email": "player@example.com",
    "displayName": "ชื่อผู้เล่น",
    "createdAt": "2023-10-01T10:00:00Z",
    "updatedAt": "2023-10-01T10:00:00Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInร9..."
}
```

## การทดสอบด้วย API Client

### ตัวอย่างการใช้ curl

#### ลงทะเบียน
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "displayName": "ผู้ทดสอบ"
  }'
```

#### เข้าสู่ระบบ
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```