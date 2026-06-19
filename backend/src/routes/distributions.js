const express = require('express');
const router = express.Router();
const { db, admin } = require('../config/firebase');
const { verifyToken } = require('../middleware/authMiddleware');

// ── GET all distributions (filtered by user) ──────────────────────────────────
router.get('/', verifyToken, async (req, res) => {
  try {
    const userData = req.userData;
    let snapshot;

    if (userData.role === 'cho') {
      // CHO sees all distributions they sent
      snapshot = await db.collection('distributions')
        .where('fromType', '==', 'cho')
        .orderBy('createdAt', 'desc')
        .get();
    } else if (userData.role === 'rhu') {
      // RHU sees distributions sent TO them and FROM them
      const [received, sent] = await Promise.all([
        db.collection('distributions').where('toRhuId', '==', userData.rhuId).get(),
        db.collection('distributions').where('fromRhuId', '==', userData.rhuId).get()
      ]);
      const all = [
        ...received.docs.map(d => ({ id: d.id, direction: 'received', ...d.data() })),
        ...sent.docs.map(d => ({ id: d.id, direction: 'sent', ...d.data() }))
      ];
      return res.json({ success: true, distributions: all });
    } else if (userData.role === 'midwife') {
      // Midwife sees distributions sent to their barangay
      snapshot = await db.collection('distributions')
        .where('toBarangayId', '==', userData.barangayId)
        .orderBy('createdAt', 'desc')
        .get();
    }

    const distributions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ success: true, distributions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── POST create new distribution ──────────────────────────────────────────────
router.post('/', verifyToken, async (req, res) => {
  const userData = req.userData;
  const { items, toRhuId, toRhuName, toBarangayId, toBarangayName } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'At least one item is required' });
  }

  try {
    const newDistribution = {
      items, // [{ name, quantity }]
      status: 'Pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: req.user.uid
    };

    // CHO → RHU distribution
    if (userData.role === 'cho') {
      if (!toRhuId) return res.status(400).json({ error: 'toRhuId is required' });
      newDistribution.fromType = 'cho';
      newDistribution.toRhuId = toRhuId;
      newDistribution.toRhuName = toRhuName;
    }

    // RHU → Barangay distribution
    if (userData.role === 'rhu') {
      if (!toBarangayId) return res.status(400).json({ error: 'toBarangayId is required' });
      newDistribution.fromType = 'rhu';
      newDistribution.fromRhuId = userData.rhuId;
      newDistribution.fromRhuName = userData.rhuName;
      newDistribution.toBarangayId = toBarangayId;
      newDistribution.toBarangayName = toBarangayName;
    }

    const docRef = await db.collection('distributions').add(newDistribution);
    res.json({ success: true, id: docRef.id, message: 'Distribution created' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── PUT update distribution status ────────────────────────────────────────────
router.put('/:id/status', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // 'Pending' or 'Completed'

  try {
    await db.collection('distributions').doc(id).update({
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ success: true, message: `Status updated to ${status}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── DELETE distribution ───────────────────────────────────────────────────────
router.delete('/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  try {
    await db.collection('distributions').doc(id).delete();
    res.json({ success: true, message: 'Distribution deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;