const express = require('express');
const router = express.Router();
const { db, admin } = require('../config/firebase');
const { verifyToken } = require('../middleware/authMiddleware');

// Helper: get owner filter based on user role
function getOwnerFilter(userData) {
  if (userData.role === 'cho') return { field: 'ownerType', value: 'cho' };
  if (userData.role === 'rhu') return { field: 'rhuId', value: userData.rhuId };
  if (userData.role === 'midwife') return { field: 'barangayId', value: userData.barangayId };
}

// ── GET all inventory (filtered by user) ─────────────────────────────────────
router.get('/', verifyToken, async (req, res) => {
  try {
    const filter = getOwnerFilter(req.userData);
    const snapshot = await db.collection('inventory')
      .where(filter.field, '==', filter.value)
      .get();

    const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── POST add new inventory item ───────────────────────────────────────────────
router.post('/', verifyToken, async (req, res) => {
  const { name, category, subCategory, quantity, expiryDate } = req.body;

  if (!name || !quantity) {
    return res.status(400).json({ error: 'name and quantity are required' });
  }

  try {
    const userData = req.userData;

    const newItem = {
      name,
      category: category || 'General',
      subCategory: subCategory || '',
      quantity: parseInt(quantity),
      remaining: parseInt(quantity),
      expiryDate: expiryDate || '',
      ownerType: userData.role,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: req.user.uid
    };

    // Add role-specific owner fields
    if (userData.role === 'rhu') {
      newItem.rhuId = userData.rhuId;
      newItem.rhuName = userData.rhuName;
    }
    if (userData.role === 'midwife') {
      newItem.barangayId = userData.barangayId;
      newItem.barangayName = userData.barangayName;
    }

    const docRef = await db.collection('inventory').add(newItem);
    res.json({ success: true, id: docRef.id, message: 'Item added to inventory' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── PUT update inventory item ─────────────────────────────────────────────────
router.put('/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  try {
    await db.collection('inventory').doc(id).update({
      ...updates,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ success: true, message: 'Item updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── DELETE inventory item ─────────────────────────────────────────────────────
router.delete('/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  try {
    await db.collection('inventory').doc(id).delete();
    res.json({ success: true, message: 'Item deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── POST dispense medicine (Midwife only) ─────────────────────────────────────
router.post('/:id/dispense', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { patientName, quantity } = req.body;

  if (!patientName || !quantity) {
    return res.status(400).json({ error: 'patientName and quantity are required' });
  }

  try {
    const itemDoc = await db.collection('inventory').doc(id).get();
    if (!itemDoc.exists) return res.status(404).json({ error: 'Item not found' });

    const item = itemDoc.data();
    const newRemaining = item.remaining - parseInt(quantity);

    if (newRemaining < 0) {
      return res.status(400).json({ error: 'Not enough stock' });
    }

    // Update remaining stock
    await db.collection('inventory').doc(id).update({
      remaining: newRemaining,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Log the dispense record
    await db.collection('dispenseRecords').add({
      itemId: id,
      itemName: item.name,
      patientName,
      quantity: parseInt(quantity),
      barangayId: req.userData.barangayId,
      dispensedBy: req.user.uid,
      dispensedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true, message: `Dispensed ${quantity} of ${item.name} to ${patientName}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;