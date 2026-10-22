const User = require('../models/User');
const { getClientIp } = require('../utils/clientIp');

const MAX_DEVICES_PER_ADMIN = 10;

function normalizeDeviceId(value) {
  return String(value || '').trim();
}

function sanitizeLabel(value) {
  return String(value || '').trim().slice(0, 60);
}

function gateSnapshot(admin) {
  const gate = admin?.adminSettings?.devices || {};
  return {
    enabled: gate.enabled === true,
    count: Array.isArray(gate.allowedDevices) ? gate.allowedDevices.length : 0,
    devices: Array.isArray(gate.allowedDevices) ? gate.allowedDevices : []
  };
}

// @desc    List admin's registered devices + gate state
// @route   GET /api/v1/admin/devices
// @access  Private/Admin
async function listDevices(req, res) {
  try {
    const admin = await User.findById(req.user.id).select('adminSettings.devices');
    res.status(200).json({ success: true, data: gateSnapshot(admin) });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Register a new device (soft-MAC) for admin login
// @route   POST /api/v1/admin/devices
// @access  Private/Admin
async function registerDevice(req, res) {
  try {
    const deviceId = normalizeDeviceId(req.body.deviceId);
    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'deviceId is required' });
    }

    const admin = await User.findById(req.user.id);
    if (!admin || admin.role !== 'admin') {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }

    admin.adminSettings = admin.adminSettings || {};
    admin.adminSettings.devices = admin.adminSettings.devices || {};
    let devices = Array.isArray(admin.adminSettings.devices.allowedDevices)
      ? [...admin.adminSettings.devices.allowedDevices]
      : [];

    const existing = devices.find((d) => d.deviceId === deviceId);
    const record = {
      deviceId,
      label: sanitizeLabel(req.body.label) || 'Dispositivo sin nombre',
      ipAddress: getClientIp(req),
      lastSeenAt: new Date()
    };

    if (existing) {
      Object.assign(existing, record);
    } else {
      if (devices.length >= MAX_DEVICES_PER_ADMIN) {
        return res.status(400).json({ success: false, error: `Max ${MAX_DEVICES_PER_ADMIN} devices allowed` });
      }
      devices.unshift({ ...record, createdAt: new Date() });
    }

    admin.adminSettings.devices.allowedDevices = devices;
    admin.markModified('adminSettings');
    await admin.save();

    res.status(200).json({ success: true, data: gateSnapshot(admin) });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Revoke a device (removes it from the allowed list)
// @route   DELETE /api/v1/admin/devices/:deviceId
// @access  Private/Admin
async function revokeDevice(req, res) {
  try {
    const deviceId = normalizeDeviceId(req.params.deviceId);
    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'deviceId is required' });
    }

    const admin = await User.findById(req.user.id);
    if (!admin || admin.role !== 'admin') {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }

    admin.adminSettings = admin.adminSettings || {};
    admin.adminSettings.devices = admin.adminSettings.devices || {};
    let devices = Array.isArray(admin.adminSettings.devices.allowedDevices)
      ? admin.adminSettings.devices.allowedDevices
      : [];

    const index = devices.findIndex((d) => d.deviceId === deviceId);
    if (index === -1) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    devices.splice(index, 1);
    admin.adminSettings.devices.allowedDevices = devices;
    admin.markModified('adminSettings');
    await admin.save();

    res.status(200).json({ success: true, data: gateSnapshot(admin) });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Enable/disable the device-only login gate for admin
// @route   POST /api/v1/admin/devices/gate
// @access  Private/Admin
async function setDeviceGate(req, res) {
  try {
    const enabled = req.body.enabled === true;

    const admin = await User.findById(req.user.id);
    if (!admin || admin.role !== 'admin') {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }

    admin.adminSettings = admin.adminSettings || {};
    admin.adminSettings.devices = admin.adminSettings.devices || {};
    admin.adminSettings.devices.enabled = enabled;
    admin.markModified('adminSettings');
    await admin.save();

    res.status(200).json({
      success: true,
      message: enabled ? 'Device gate enabled' : 'Device gate disabled',
      data: gateSnapshot(admin)
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// Helper used by the login flow: validates that the presented device is authorized
// when the gate is enabled and records lastSeenAt on matching devices.
async function checkAdminDevice(admin, deviceId, clientIp) {
  const gate = admin.adminSettings?.devices || {};

  // When the gate is off, any admin login is accepted.
  if (gate.enabled !== true) {
    return { ok: true, gateEnabled: false };
  }

  const normalized = normalizeDeviceId(deviceId);
  const devices = Array.isArray(gate.allowedDevices) ? gate.allowedDevices : [];
  const match = devices.find((d) => d.deviceId === normalized);

  // Bootstrap recovery: gate on with an empty device list can only be claimed from a
  // trusted admin IP (LAN/private or a previously known admin public IP). This prevents
  // locking the real admin out while still blocking a remote attacker with stolen creds.
  if (!match && devices.length === 0) {
    const { isKnownAdminIp, isPrivateOrLocalIp } = require('../utils/adminKnownIps');
    const trusted = isPrivateOrLocalIp(clientIp) || (await isKnownAdminIp(clientIp));
    if (trusted) {
      try {
        devices.unshift({
          deviceId: normalized,
          label: 'Autoregistrado (IP confiable)',
          ipAddress: clientIp,
          createdAt: new Date(),
          lastSeenAt: new Date()
        });
        admin.adminSettings.devices.allowedDevices = devices;
        admin.markModified('adminSettings');
        await admin.save();
        return { ok: true, gateEnabled: true, bootstrap: true };
      } catch (err) {
        /* fall through to block */
      }
    }
  }

  if (!normalized || !match) {
    return {
      ok: false,
      gateEnabled: true,
      error: {
        code: 'DEVICE_NOT_AUTHORIZED',
        message: 'Este dispositivo no está autorizado. Iniciá sesión desde un dispositivo registrado o registrá este dispositivo desde el panel de Configuración.'
      }
    };
  }

  // Touch lastSeenAt (best effort, no user-facing impact).
  try {
    match.lastSeenAt = new Date();
    if (clientIp) match.ipAddress = clientIp;
    admin.markModified('adminSettings');
    await admin.save();
  } catch (err) {
    /* ignore */
  }

  return { ok: true, gateEnabled: true };
}

module.exports = {
  listDevices,
  registerDevice,
  revokeDevice,
  setDeviceGate,
  checkAdminDevice
};