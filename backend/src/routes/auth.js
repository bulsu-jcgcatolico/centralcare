const express = require('express');
const router = express.Router();
const { admin, db, auth } = require('../config/firebase');
const { verifyToken } = require('../middleware/authMiddleware');

// ── Login ─────────────────────────────────────────────────────────────────────
// Frontend sends Firebase ID token after login
// Backend verifies and returns user data with role
router.post('/verify', verifyToken, async (req, res) => {
  try {
    res.json({
      success: true,
      user: {
        uid: req.user.uid,
        email: req.user.email,
        ...req.userData
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Create Account (IT Admin Only) ────────────────────────────────────────────
// Called by IT admin to create RHU, Midwife, or CHO accounts
router.post('/create-account', async (req, res) => {
  const { email, password, role, username, rhuId, rhuName, barangayId, barangayName } = req.body;

  // Basic validation
  if (!email || !password || !role || !username) {
    return res.status(400).json({ error: 'email, password, role, and username are required' });
  }

  const validRoles = ['cho', 'rhu', 'midwife'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: 'Role must be cho, rhu, or midwife' });
  }

  if (role === 'rhu' && !rhuId) {
    return res.status(400).json({ error: 'rhuId is required for RHU accounts' });
  }

  if (role === 'midwife' && !barangayId) {
    return res.status(400).json({ error: 'barangayId is required for Midwife accounts' });
  }

  try {
    // Create Firebase Auth user
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: username
    });

    // Save user data to Firestore
    const userData = {
      uid: userRecord.uid,
      email,
      username,
      role,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // Add role-specific fields
    if (role === 'rhu') {
      userData.rhuId = rhuId;
      userData.rhuName = rhuName || `RHU ${rhuId}`;
    }

    if (role === 'midwife') {
      userData.barangayId = barangayId;
      userData.barangayName = barangayName || `Barangay ${barangayId}`;
    }

    await db.collection('users').doc(userRecord.uid).set(userData);

    res.json({
      success: true,
      message: `Account created for ${username}`,
      uid: userRecord.uid
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Get All Users (IT Admin Only) ─────────────────────────────────────────────
router.get('/users', verifyToken, async (req, res) => {
  try {
    const snapshot = await db.collection('users').get();
    const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Delete Account (IT Admin Only) ────────────────────────────────────────────
router.delete('/delete-account/:uid', async (req, res) => {
  const { uid } = req.params;
  try {
    // Delete from Firebase Auth
    await admin.auth().deleteUser(uid);
    // Delete from Firestore
    await db.collection('users').doc(uid).delete();
    res.json({ success: true, message: 'Account deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;