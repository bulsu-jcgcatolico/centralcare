const express = require('express');
const router = express.Router();
const { db, admin } = require('../config/firebase');
const { verifyToken } = require('../middleware/authMiddleware');

// ── GET all patients (filtered by barangay) ───────────────────────────────────
router.get('/', verifyToken, async (req, res) => {
  try {
    const userData = req.userData;
    const { type } = req.query; // 'child' or 'adult'

    let query = db.collection('patients');

    // Midwife only sees their barangay's patients
    if (userData.role === 'midwife') {
      query = query.where('barangayId', '==', userData.barangayId);
    }

    // RHU sees all patients in their RHU area
    if (userData.role === 'rhu') {
      query = query.where('rhuId', '==', userData.rhuId);
    }

    // Filter by type if provided
    if (type) {
      query = query.where('type', '==', type);
    }

    const snapshot = await query.get();
    const patients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ success: true, patients });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET single patient ────────────────────────────────────────────────────────
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const doc = await db.collection('patients').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Patient not found' });
    res.json({ success: true, patient: { id: doc.id, ...doc.data() } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── POST create new patient ───────────────────────────────────────────────────
router.post('/', verifyToken, async (req, res) => {
  const userData = req.userData;
  const { type, ...patientData } = req.body;

  if (!type || !['child', 'adult'].includes(type)) {
    return res.status(400).json({ error: 'type must be child or adult' });
  }

  try {
    // Auto-generate patient ID like #1001
    const snapshot = await db.collection('patients')
      .where('barangayId', '==', userData.barangayId)
      .get();
    const patientNumber = snapshot.size + 1;
    const patientId = `#${String(patientNumber).padStart(4, '0')}`;

    const newPatient = {
      ...patientData,
      type,
      patientId,
      barangayId: userData.barangayId,
      barangayName: userData.barangayName,
      rhuId: userData.rhuId || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: req.user.uid,
      lastVisit: new Date().toISOString().split('T')[0]
    };

    const docRef = await db.collection('patients').add(newPatient);
    res.json({ success: true, id: docRef.id, patientId, message: 'Patient registered' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── PUT update patient ────────────────────────────────────────────────────────
router.put('/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  try {
    await db.collection('patients').doc(id).update({
      ...req.body,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ success: true, message: 'Patient updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── DELETE patient ────────────────────────────────────────────────────────────
router.delete('/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  try {
    await db.collection('patients').doc(id).delete();
    res.json({ success: true, message: 'Patient deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;