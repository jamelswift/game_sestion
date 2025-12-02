import * as bcrypt from 'bcrypt';

/**
 * สร้าง SQL statements สำหรับ insert test users
 * รัน: npx ts-node scripts/generate-test-users.ts
 */

interface TestUser {
  email: string;
  password: string;
  displayName: string;
}

const testUsers: TestUser[] = [
  { email: 'admin@finix.com', password: 'admin123', displayName: 'Admin User' },
  { email: 'player1@finix.com', password: 'password123', displayName: 'ผู้เล่น 1' },
  { email: 'player2@finix.com', password: 'password123', displayName: 'ผู้เล่น 2' },
  { email: 'test@example.com', password: 'test123', displayName: 'Test User' },
  { email: 'demo@finix.com', password: 'demo123', displayName: 'Demo User' },
  { email: 'user1@gmail.com', password: 'finix2023', displayName: 'สมชาย ใจดี' },
  { email: 'user2@gmail.com', password: 'finix2023', displayName: 'สมหญิง สวยงาม' },
  { email: 'user3@hotmail.com', password: 'game123', displayName: 'ธนวัฒน์ เจริญสุข' },
  { email: 'user4@yahoo.com', password: 'game123', displayName: 'มณีรัตน์ ทองคำ' },
  { email: 'user5@outlook.com', password: 'game123', displayName: 'วิทวัส สุขใส' },
];

async function generateTestUsers() {
  console.log('👥 Generating test users with hashed passwords...\n');
  console.log('=' .repeat(80));

  const saltRounds = 10;
  const sqlStatements: string[] = [];

  console.log('📝 Hashing passwords...\n');

  for (let i = 0; i < testUsers.length; i++) {
    const user = testUsers[i];
    try {
      const hashedPassword = await bcrypt.hash(user.password, saltRounds);
      
      const sql = `INSERT INTO players (email, password, display_name, created_at) VALUES ('${user.email}', '${hashedPassword}', '${user.displayName}', NOW());`;
      sqlStatements.push(sql);

      console.log(`${i + 1}. ${user.displayName}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Password: ${user.password}`);
      console.log(`   ✅ Hashed successfully`);
      console.log('');
    } catch (error) {
      console.error(`❌ Error hashing password for ${user.email}:`, error.message);
    }
  }

  console.log('=' .repeat(80));
  console.log('\n📋 SQL Statements for bulk insert:\n');
  console.log('-- Copy and paste these into your PostgreSQL client --\n');
  
  sqlStatements.forEach((sql) => {
    console.log(sql);
  });

  console.log('\n-- Or run all at once:');
  console.log('BEGIN;');
  sqlStatements.forEach((sql) => {
    console.log(sql);
  });
  console.log('COMMIT;');

  console.log('\n✅ Generated SQL for ' + testUsers.length + ' users!');
  console.log('\n📖 Login credentials:');
  console.log('-'.repeat(80));
  testUsers.forEach((user, i) => {
    console.log(`${i + 1}. ${user.email} / ${user.password}`);
  });

  console.log('\n💡 How to use:');
  console.log('1. Connect to your PostgreSQL database');
  console.log('2. Copy the SQL statements above');
  console.log('3. Execute them in your database client');
  console.log('4. Test login with any of the credentials above');
}

generateTestUsers()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });
