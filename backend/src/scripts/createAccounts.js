/**
 * CentralCare - Create User Accounts Script
 * 
 * HOW TO USE:
 * 1. Edit the accounts array below with your real accounts
 * 2. Run: node src/scripts/createAccounts.js
 * 
 * Run this ONCE to set up all your accounts in Firebase.
 */

const { admin, db } = require('../config/firebase');

const accountsToCreate = [

  // ── CHO Account (only 1) ──────────────────────────────────────────────────
  {
    email: 'cho@centralcare.com',
    password: 'cho_password_123',
    username: 'CHO Admin',
    role: 'cho'
  },

  // ── RHU Accounts (10 RHUs) ────────────────────────────────────────────────
  {
    email: 'rhu1@centralcare.com',
    password: 'rhu1_password_123',
    username: 'RHU 1 Admin',
    role: 'rhu',
    rhuId: 1,
    rhuName: 'RHU 1 - Longos'
  },
  {
    email: 'rhu2@centralcare.com',
    password: 'rhu2_password_123',
    username: 'RHU 2 Admin',
    role: 'rhu',
    rhuId: 2,
    rhuName: 'RHU 2 - Caingin'
  },
  {
    email: 'rhu3@centralcare.com',
    password: 'rhu3_password_123',
    username: 'RHU 3 Admin',
    role: 'rhu',
    rhuId: 3,
    rhuName: 'RHU 3 - Catmon'
  },
  {
    email: 'rhu4@centralcare.com',
    password: 'rhu4_password_123',
    username: 'RHU 4 Admin',
    role: 'rhu',
    rhuId: 4,
    rhuName: 'RHU 4 - Bulihan'
  },
  {
    email: 'rhu5@centralcare.com',
    password: 'rhu5_password_123',
    username: 'RHU 5 Admin',
    role: 'rhu',
    rhuId: 5,
    rhuName: 'RHU 5 - Guinhawa'
  },
  {
    email: 'rhu6@centralcare.com',
    password: 'rhu6_password_123',
    username: 'RHU 6 Admin',
    role: 'rhu',
    rhuId: 6,
    rhuName: 'RHU 6 - Liang'
  },
  {
    email: 'rhu7@centralcare.com',
    password: 'rhu7_password_123',
    username: 'RHU 7 Admin',
    role: 'rhu',
    rhuId: 7,
    rhuName: 'RHU 7 - Lugam'
  },
  {
    email: 'rhu8@centralcare.com',
    password: 'rhu8_password_123',
    username: 'RHU 8 Admin',
    role: 'rhu',
    rhuId: 8,
    rhuName: 'RHU 8 - Mojon'
  },
  {
    email: 'rhu9@centralcare.com',
    password: 'rhu9_password_123',
    username: 'RHU 9 Admin',
    role: 'rhu',
    rhuId: 9,
    rhuName: 'RHU 9 - Bangkal'
  },
  {
    email: 'rhu10@centralcare.com',
    password: 'rhu10_password_123',
    username: 'RHU 10 Admin',
    role: 'rhu',
    rhuId: 10,
    rhuName: 'RHU 10 - Babatnin'
  },

  // ── Midwife Accounts (add as many as needed) ──────────────────────────────
  {
    email: 'midwife.longos@centralcare.com',
    password: 'midwife_longos_123',
    username: 'Maria Santos',
    role: 'midwife',
    barangayId: 1,
    barangayName: 'Longos'
  },
  {
    email: 'midwife.caingin@centralcare.com',
    password: 'midwife_caingin_123',
    username: 'Ana Reyes',
    role: 'midwife',
    barangayId: 2,
    barangayName: 'Caingin'
  },
  // Add more midwife accounts here following the same pattern...

];

async function createAccounts() {
  console.log('🚀 Starting account creation...\n');

  for (const account of accountsToCreate) {
    try {
      // Create in Firebase Auth
      const userRecord = await admin.auth().createUser({
        email: account.email,
        password: account.password,
        displayName: account.username
      });

      // Save to Firestore
      const userData = {
        uid: userRecord.uid,
        email: account.email,
        username: account.username,
        role: account.role,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };

      if (account.role === 'rhu') {
        userData.rhuId = account.rhuId;
        userData.rhuName = account.rhuName;
      }

      if (account.role === 'midwife') {
        userData.barangayId = account.barangayId;
        userData.barangayName = account.barangayName;
      }

      await db.collection('users').doc(userRecord.uid).set(userData);

      console.log(`✅ Created: ${account.email} (${account.role})`);

    } catch (error) {
      if (error.code === 'auth/email-already-exists') {
        console.log(`⚠️  Already exists: ${account.email} - skipping`);
      } else {
        console.log(`❌ Failed: ${account.email} - ${error.message}`);
      }
    }
  }

  console.log('\n✅ Done! All accounts processed.');
  process.exit(0);
}

createAccounts();