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
    rhuName: 'RHU 1'
  },
  {
    email: 'rhu2@centralcare.com',
    password: 'rhu2_password_123',
    username: 'RHU 2 Admin',
    role: 'rhu',
    rhuId: 2,
    rhuName: 'RHU 2'
  },
  {
    email: 'rhu3@centralcare.com',
    password: 'rhu3_password_123',
    username: 'RHU 3 Admin',
    role: 'rhu',
    rhuId: 3,
    rhuName: 'RHU 3'
  },
  {
    email: 'rhu4@centralcare.com',
    password: 'rhu4_password_123',
    username: 'RHU 4 Admin',
    role: 'rhu',
    rhuId: 4,
    rhuName: 'RHU 4'
  },
  {
    email: 'rhu5@centralcare.com',
    password: 'rhu5_password_123',
    username: 'RHU 5 Admin',
    role: 'rhu',
    rhuId: 5,
    rhuName: 'RHU 5'
  },
  {
    email: 'rhu6@centralcare.com',
    password: 'rhu6_password_123',
    username: 'RHU 6 Admin',
    role: 'rhu',
    rhuId: 6,
    rhuName: 'RHU 6'
  },
  {
    email: 'rhu7@centralcare.com',
    password: 'rhu7_password_123',
    username: 'RHU 7 Admin',
    role: 'rhu',
    rhuId: 7,
    rhuName: 'RHU 7'
  },
  {
    email: 'rhu8@centralcare.com',
    password: 'rhu8_password_123',
    username: 'RHU 8 Admin',
    role: 'rhu',
    rhuId: 8,
    rhuName: 'RHU 8'
  },
  {
    email: 'rhu9@centralcare.com',
    password: 'rhu9_password_123',
    username: 'RHU 9 Admin',
    role: 'rhu',
    rhuId: 9,
    rhuName: 'RHU 9'
  },
  {
    email: 'rhu10@centralcare.com',
    password: 'rhu10_password_123',
    username: 'RHU 10 Admin',
    role: 'rhu',
    rhuId: 10,
    rhuName: 'RHU 10'
  },

  // ── Midwife Accounts (51 barangays, alphabetical order) ───────────────────
  {
    email: 'midwife.anilao@centralcare.com',
    password: 'midwife_anilao_123',
    username: 'Anilao Midwife',
    role: 'midwife',
    barangayId: 3,
    barangayName: 'Anilao'
  },
  {
    email: 'midwife.atlag@centralcare.com',
    password: 'midwife_atlag_123',
    username: 'Atlag Midwife',
    role: 'midwife',
    barangayId: 4,
    barangayName: 'Atlag'
  },
  {
    email: 'midwife.babatnin@centralcare.com',
    password: 'midwife_babatnin_123',
    username: 'Babatnin Midwife',
    role: 'midwife',
    barangayId: 5,
    barangayName: 'Babatnin'
  },
  {
    email: 'midwife.bagna@centralcare.com',
    password: 'midwife_bagna_123',
    username: 'Bagna Midwife',
    role: 'midwife',
    barangayId: 6,
    barangayName: 'Bagna'
  },
  {
    email: 'midwife.bagongbayan@centralcare.com',
    password: 'midwife_bagongbayan_123',
    username: 'Bagong Bayan Midwife',
    role: 'midwife',
    barangayId: 7,
    barangayName: 'Bagong Bayan'
  },
  {
    email: 'midwife.balayong@centralcare.com',
    password: 'midwife_balayong_123',
    username: 'Balayong Midwife',
    role: 'midwife',
    barangayId: 8,
    barangayName: 'Balayong'
  },
  {
    email: 'midwife.balite@centralcare.com',
    password: 'midwife_balite_123',
    username: 'Balite Midwife',
    role: 'midwife',
    barangayId: 9,
    barangayName: 'Balite'
  },
  {
    email: 'midwife.bangkal@centralcare.com',
    password: 'midwife_bangkal_123',
    username: 'Bangkal Midwife',
    role: 'midwife',
    barangayId: 10,
    barangayName: 'Bangkal'
  },
  {
    email: 'midwife.barihan@centralcare.com',
    password: 'midwife_barihan_123',
    username: 'Barihan Midwife',
    role: 'midwife',
    barangayId: 11,
    barangayName: 'Barihan'
  },
  {
    email: 'midwife.bulihan@centralcare.com',
    password: 'midwife_bulihan_123',
    username: 'Bulihan Midwife',
    role: 'midwife',
    barangayId: 12,
    barangayName: 'Bulihan'
  },
  {
    email: 'midwife.bungahan@centralcare.com',
    password: 'midwife_bungahan_123',
    username: 'Bungahan Midwife',
    role: 'midwife',
    barangayId: 13,
    barangayName: 'Bungahan'
  },
  {
    email: 'midwife.caingin@centralcare.com',
    password: 'midwife_caingin_123',
    username: 'Ana Reyes',
    role: 'midwife',
    barangayId: 2,
    barangayName: 'Caingin'
  },
  {
    email: 'midwife.calero@centralcare.com',
    password: 'midwife_calero_123',
    username: 'Calero Midwife',
    role: 'midwife',
    barangayId: 14,
    barangayName: 'Calero'
  },
  {
    email: 'midwife.caliligawan@centralcare.com',
    password: 'midwife_caliligawan_123',
    username: 'Caliligawan Midwife',
    role: 'midwife',
    barangayId: 15,
    barangayName: 'Caliligawan'
  },
  {
    email: 'midwife.canalate@centralcare.com',
    password: 'midwife_canalate_123',
    username: 'Canalate Midwife',
    role: 'midwife',
    barangayId: 16,
    barangayName: 'Canalate'
  },
  {
    email: 'midwife.caniogan@centralcare.com',
    password: 'midwife_caniogan_123',
    username: 'Caniogan Midwife',
    role: 'midwife',
    barangayId: 17,
    barangayName: 'Caniogan'
  },
  {
    email: 'midwife.catmon@centralcare.com',
    password: 'midwife_catmon_123',
    username: 'Catmon Midwife',
    role: 'midwife',
    barangayId: 18,
    barangayName: 'Catmon'
  },
  {
    email: 'midwife.cofradia@centralcare.com',
    password: 'midwife_cofradia_123',
    username: 'Cofradia Midwife',
    role: 'midwife',
    barangayId: 19,
    barangayName: 'Cofradia'
  },
  {
    email: 'midwife.dakila@centralcare.com',
    password: 'midwife_dakila_123',
    username: 'Dakila Midwife',
    role: 'midwife',
    barangayId: 20,
    barangayName: 'Dakila'
  },
  {
    email: 'midwife.guinhawa@centralcare.com',
    password: 'midwife_guinhawa_123',
    username: 'Guinhawa Midwife',
    role: 'midwife',
    barangayId: 21,
    barangayName: 'Guinhawa'
  },
  {
    email: 'midwife.liang@centralcare.com',
    password: 'midwife_liang_123',
    username: 'Liang Midwife',
    role: 'midwife',
    barangayId: 22,
    barangayName: 'Liang'
  },
  {
    email: 'midwife.ligas@centralcare.com',
    password: 'midwife_ligas_123',
    username: 'Ligas Midwife',
    role: 'midwife',
    barangayId: 23,
    barangayName: 'Ligas'
  },
  {
    email: 'midwife.longos@centralcare.com',
    password: 'midwife_longos_123',
    username: 'Maria Santos',
    role: 'midwife',
    barangayId: 1,
    barangayName: 'Longos'
  },
  {
    email: 'midwife.look1st@centralcare.com',
    password: 'midwife_look1st_123',
    username: 'Look 1st Midwife',
    role: 'midwife',
    barangayId: 24,
    barangayName: 'Look 1st'
  },
  {
    email: 'midwife.look2nd@centralcare.com',
    password: 'midwife_look2nd_123',
    username: 'Look 2nd Midwife',
    role: 'midwife',
    barangayId: 25,
    barangayName: 'Look 2nd'
  },
  {
    email: 'midwife.lugam@centralcare.com',
    password: 'midwife_lugam_123',
    username: 'Lugam Midwife',
    role: 'midwife',
    barangayId: 26,
    barangayName: 'Lugam'
  },
  {
    email: 'midwife.mabolo@centralcare.com',
    password: 'midwife_mabolo_123',
    username: 'Mabolo Midwife',
    role: 'midwife',
    barangayId: 27,
    barangayName: 'Mabolo'
  },
  {
    email: 'midwife.mambog@centralcare.com',
    password: 'midwife_mambog_123',
    username: 'Mambog Midwife',
    role: 'midwife',
    barangayId: 28,
    barangayName: 'Mambog'
  },
  {
    email: 'midwife.masile@centralcare.com',
    password: 'midwife_masile_123',
    username: 'Masile Midwife',
    role: 'midwife',
    barangayId: 29,
    barangayName: 'Masile'
  },
  {
    email: 'midwife.matimbo@centralcare.com',
    password: 'midwife_matimbo_123',
    username: 'Matimbo Midwife',
    role: 'midwife',
    barangayId: 30,
    barangayName: 'Matimbo'
  },
  {
    email: 'midwife.mojon@centralcare.com',
    password: 'midwife_mojon_123',
    username: 'Mojon Midwife',
    role: 'midwife',
    barangayId: 31,
    barangayName: 'Mojon'
  },
  {
    email: 'midwife.namayan@centralcare.com',
    password: 'midwife_namayan_123',
    username: 'Namayan Midwife',
    role: 'midwife',
    barangayId: 32,
    barangayName: 'Namayan'
  },
  {
    email: 'midwife.niugan@centralcare.com',
    password: 'midwife_niugan_123',
    username: 'Niugan Midwife',
    role: 'midwife',
    barangayId: 33,
    barangayName: 'Niugan'
  },
  {
    email: 'midwife.pamarawan@centralcare.com',
    password: 'midwife_pamarawan_123',
    username: 'Pamarawan Midwife',
    role: 'midwife',
    barangayId: 34,
    barangayName: 'Pamarawan'
  },
  {
    email: 'midwife.panasahan@centralcare.com',
    password: 'midwife_panasahan_123',
    username: 'Panasahan Midwife',
    role: 'midwife',
    barangayId: 35,
    barangayName: 'Panasahan'
  },
  {
    email: 'midwife.pinagbakahan@centralcare.com',
    password: 'midwife_pinagbakahan_123',
    username: 'Pinagbakahan Midwife',
    role: 'midwife',
    barangayId: 36,
    barangayName: 'Pinagbakahan'
  },
  {
    email: 'midwife.sbata@centralcare.com',
    password: 'midwife_sbata_123',
    username: 'S. Bata Midwife',
    role: 'midwife',
    barangayId: 37,
    barangayName: 'S. Bata'
  },
  {
    email: 'midwife.smatanda@centralcare.com',
    password: 'midwife_smatanda_123',
    username: 'S. Matanda Midwife',
    role: 'midwife',
    barangayId: 38,
    barangayName: 'S. Matanda'
  },
  {
    email: 'midwife.sanagustin@centralcare.com',
    password: 'midwife_sanagustin_123',
    username: 'San Agustin Midwife',
    role: 'midwife',
    barangayId: 39,
    barangayName: 'San Agustin'
  },
  {
    email: 'midwife.sangabriel@centralcare.com',
    password: 'midwife_sangabriel_123',
    username: 'San Gabriel Midwife',
    role: 'midwife',
    barangayId: 40,
    barangayName: 'San Gabriel'
  },
  {
    email: 'midwife.sanjuan@centralcare.com',
    password: 'midwife_sanjuan_123',
    username: 'San Juan Midwife',
    role: 'midwife',
    barangayId: 41,
    barangayName: 'San Juan'
  },
  {
    email: 'midwife.sanpablo@centralcare.com',
    password: 'midwife_sanpablo_123',
    username: 'San Pablo Midwife',
    role: 'midwife',
    barangayId: 42,
    barangayName: 'San Pablo'
  },
  {
    email: 'midwife.sanvicente@centralcare.com',
    password: 'midwife_sanvicente_123',
    username: 'San Vicente Midwife',
    role: 'midwife',
    barangayId: 43,
    barangayName: 'San Vicente'
  },
  {
    email: 'midwife.santiago@centralcare.com',
    password: 'midwife_santiago_123',
    username: 'Santiago Midwife',
    role: 'midwife',
    barangayId: 44,
    barangayName: 'Santiago'
  },
  {
    email: 'midwife.santor@centralcare.com',
    password: 'midwife_santor_123',
    username: 'Santor Midwife',
    role: 'midwife',
    barangayId: 45,
    barangayName: 'Santor'
  },
  {
    email: 'midwife.stmatrinidad@centralcare.com',
    password: 'midwife_stmatrinidad_123',
    username: 'Stma. Trinidad Midwife',
    role: 'midwife',
    barangayId: 46,
    barangayName: 'Stma. Trinidad'
  },
  {
    email: 'midwife.stocristo@centralcare.com',
    password: 'midwife_stocristo_123',
    username: 'Sto. Cristo Midwife',
    role: 'midwife',
    barangayId: 47,
    barangayName: 'Sto. Cristo'
  },
  {
    email: 'midwife.stonino@centralcare.com',
    password: 'midwife_stonino_123',
    username: 'Sto. Nino Midwife',
    role: 'midwife',
    barangayId: 48,
    barangayName: 'Sto. Nino'
  },
  {
    email: 'midwife.storosario@centralcare.com',
    password: 'midwife_storosario_123',
    username: 'Sto. Rosario Midwife',
    role: 'midwife',
    barangayId: 49,
    barangayName: 'Sto. Rosario'
  },
  {
    email: 'midwife.taal@centralcare.com',
    password: 'midwife_taal_123',
    username: 'Taal Midwife',
    role: 'midwife',
    barangayId: 50,
    barangayName: 'Taal'
  },
  {
    email: 'midwife.tikay@centralcare.com',
    password: 'midwife_tikay_123',
    username: 'Tikay Midwife',
    role: 'midwife',
    barangayId: 51,
    barangayName: 'Tikay'
  },

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

  console.log('\n✅ Done creating new accounts!\n');

  // ── One-time fix: correct existing RHU accounts' rhuName field ────────────
  console.log('🔧 Checking RHU names...\n');
  const rhuSnapshot = await db.collection('users').where('role', '==', 'rhu').get();

  for (const doc of rhuSnapshot.docs) {
    const data = doc.data();
    const correctName = `RHU ${data.rhuId}`;

    if (data.rhuName === correctName) {
      console.log(`✓ Already correct: ${data.email} -> "${correctName}"`);
      continue;
    }

    await doc.ref.update({ rhuName: correctName });
    console.log(`✅ Fixed: ${data.email} — "${data.rhuName}" -> "${correctName}"`);
  }

  console.log('\n✅ All done!');
  process.exit(0);
}

createAccounts();