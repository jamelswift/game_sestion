import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// รายชื่อภาษาไทยสำหรับสุ่ม
const thaiNames = [
  'ดวงมณี แสงสว่าง', 'ฝนทิพย์ สวัสดิ์', 'ธนวัฒน์ ใจดี', 'มณีรัตน์ อุไรวรรณ์',
  'ปริยากร สุขใส', 'วิทวัส เจริญสุข', 'อัญชนา ดวงใจ', 'ธีรพงษ์ มั่นคง',
  'นันทพร สง่างาม', 'ภัทรพล วิมานทอง', 'จุฑามาศ รุ่งเรือง', 'กิตติพงศ์ เมืองงาม',
  'สิริรัตน์ ปทุมรัตน์', 'วรวิทย์ สมหวัง', 'กนกวรรณ แสงทอง', 'อภิชาติ มงคลสุข',
  'ชนิกานต์ สุขศรี', 'ปณิธาน เจริญผล', 'วิมลรัตน์ ใจบุญ', 'สุรพงษ์ ดีใจ',
  'พิมพ์ลดา ทองคำ', 'นริศรา สว่างใส', 'ธนาธิป วิริยะ', 'กมลลักษณ์ น้ำใจ',
  'รัตนาพร ดวงดี', 'ศิริชัย ปัญญา', 'วริษา มีสุข', 'อนันต์ รุ่งโรจน์'
];

const emailDomains = ['gmail.com', 'hotmail.com', 'yahoo.com', 'outlook.com', 'live.com'];
const passwords = ['password123', 'finix2023', 'game123456', 'player2023', 'boardgame123', 'test123456'];

function generateRandomString(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function seedPostgresUsers() {
  console.log('🐘 Starting PostgreSQL user seeding for Finix Game...');
  console.log('=' .repeat(60));

  try {
    // ตรวจสอบการเชื่อมต่อ
    await prisma.$connect();
    console.log('✅ Connected to PostgreSQL successfully');

    // ลบข้อมูลเก่า (ถ้ามี)
    const deleteResult = await prisma.player.deleteMany();
    console.log(`🗑️ Cleared ${deleteResult.count} existing users`);

    // สร้างข้อมูลผู้ใช้ 100 คน
    console.log('\n🌱 Creating 100 users...');
    
    const users: Array<{
      id: number;
      email: string;
      displayName: string;
      originalPassword: string;
    }> = [];
    const saltRounds = 10;

    for (let i = 1; i <= 100; i++) {
      const randomName = thaiNames[Math.floor(Math.random() * thaiNames.length)];
      const randomDomain = emailDomains[Math.floor(Math.random() * emailDomains.length)];
      const randomString = generateRandomString(6);
      const randomPassword = passwords[Math.floor(Math.random() * passwords.length)];
      
      const email = `user${i}_${randomString}@${randomDomain}`;
      const hashedPassword = await bcrypt.hash(randomPassword, saltRounds);

      const user = await prisma.player.create({
        data: {
          email,
          password: hashedPassword,
          displayName: randomName,
        },
      });

      users.push({ ...user, originalPassword: randomPassword });

      if (i % 10 === 0) {
        console.log(`📝 Created ${i}/100 users...`);
      }
    }

    console.log('\n✅ Successfully created 100 users in PostgreSQL!');

    // แสดงตัวอย่างผู้ใช้ 5 คนแรก
    const sampleUsers = users.slice(0, 5);

    console.log('\n📋 Sample users created:');
    console.log('-'.repeat(80));
    sampleUsers.forEach((user, index) => {
      console.log(`👤 User ${index + 1}:`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Name: ${user.displayName}`);
      console.log(`   Password: ${user.originalPassword}`);
      console.log('');
    });

    console.log('🔑 Available passwords for testing:');
    console.log('   - password123, finix2023, game123456');
    console.log('   - player2023, boardgame123, test123456');

    console.log('\n🧪 Test login with:');
    console.log(`curl -X POST http://localhost:3000/auth/login \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -d '{"email":"${sampleUsers[0].email}","password":"${sampleUsers[0].originalPassword}"}'`);

    // ตรวจสอบจำนวนผู้ใช้ทั้งหมด
    const totalUsers = await prisma.player.count();
    console.log(`\n📊 Total users in database: ${totalUsers}`);

  } catch (error) {
    console.error('\n❌ Error seeding users:', error);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('💡 PostgreSQL connection refused:');
      console.error('   1. Check if Docker container is running: docker ps');
      console.error('   2. Check if PostgreSQL is accessible: docker logs postgres-finix');
    } else if (error.code === 'P1001') {
      console.error('💡 Database connection error:');
      console.error('   1. Verify DATABASE_URL in .env file');
      console.error('   2. Check PostgreSQL container status');
    }
  } finally {
    await prisma.$disconnect();
    console.log('\n🔚 Disconnected from database');
  }
}

// รันสคริปต์
if (require.main === module) {
  seedPostgresUsers()
    .catch((error) => {
      console.error('❌ Fatal error:', error);
      process.exit(1);
    });
}

export default seedPostgresUsers;