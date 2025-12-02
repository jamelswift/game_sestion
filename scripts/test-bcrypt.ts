import * as bcrypt from 'bcrypt';

/**
 * สคริปต์สำหรับทดสอบ bcrypt และสร้าง hashed password
 * รัน: npx ts-node scripts/test-bcrypt.ts
 */

async function testBcrypt() {
  console.log('🔐 Testing bcrypt password hashing...\n');

  const testPasswords = [
    'password123',
    'test123',
    'finix2023',
    'admin123'
  ];

  const saltRounds = 10;

  console.log('📝 Generating hashed passwords:\n');
  console.log('=' .repeat(80));

  for (const password of testPasswords) {
    try {
      const hashed = await bcrypt.hash(password, saltRounds);
      console.log(`Password: ${password}`);
      console.log(`Hashed:  ${hashed}`);
      
      // ทดสอบ compare
      const isMatch = await bcrypt.compare(password, hashed);
      console.log(`Verify:  ${isMatch ? '✅ Match' : '❌ No match'}`);
      console.log('-'.repeat(80));
    } catch (error) {
      console.error(`❌ Error hashing ${password}:`, error.message);
    }
  }

  // แสดงตัวอย่าง SQL สำหรับ manual insert
  console.log('\n📋 Sample SQL for manual user creation:\n');
  
  const sampleEmail = 'test@example.com';
  const samplePassword = 'password123';
  const sampleName = 'Test User';
  const hashedPassword = await bcrypt.hash(samplePassword, saltRounds);

  console.log(`-- Insert test user with hashed password`);
  console.log(`INSERT INTO players (email, password, display_name, created_at)`);
  console.log(`VALUES ('${sampleEmail}', '${hashedPassword}', '${sampleName}', NOW());`);
  
  console.log('\n✅ bcrypt is working correctly!');
  console.log('\n💡 To create users:');
  console.log('1. Run this script to generate hashed passwords');
  console.log('2. Use the SQL above to insert users manually');
  console.log('3. Or run: npm run seed:postgres (when database is accessible)');
}

testBcrypt()
  .then(() => {
    console.log('\n✨ Test completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
