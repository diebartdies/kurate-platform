const Province = require('../models/Province');
const City = require('../models/City');
const Neighborhood = require('../models/Neighborhood');
const Department = require('../models/Department');
const { escapeRegex } = require('../utils/flexibleText');

const stripDiacritics = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// @desc    Get all provinces
// @route   GET /api/v1/locations/provinces
// @access  Public
exports.getProvinces = async (req, res, next) => {
  try {
    const provinces = await Province.find().sort('name');
    res.status(200).json({
      success: true,
      count: provinces.length,
      data: provinces
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Get sublocations (cities or neighborhoods) by province ID
// @route   GET /api/v1/locations/provinces/:provinceId/sublocations
// @access  Public
exports.getSublocations = async (req, res, next) => {
  try {
    const provinceId = req.params.provinceId;
    const province = await Province.findById(provinceId);

    if (!province) {
      return res.status(404).json({ success: false, error: 'Province not found' });
    }

    // If the province is CABA, return its neighborhoods. Otherwise, return its cities.
    if (province.name === 'CABA') {
      const neighborhoods = await Neighborhood.find({ province: provinceId }).sort('name');
      return res.status(200).json({
        success: true,
        type: 'neighborhoods',
        count: neighborhoods.length,
        data: neighborhoods
      });
    } else {
      const cities = await City.find({ province: provinceId }).sort('name');
      return res.status(200).json({
        success: true,
        type: 'cities',
        count: cities.length,
        data: cities
      });
    }
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// Las provincias llegan desde la URL y pueden venir sin tildes
// ("Entre Rios"), con alias ("CABA") o con caracteres especiales.
const provinceAliases = {
  caba: 'CABA',
  'ciudad autonoma de buenos aires': 'CABA',
  'buenos aires': 'Buenos Aires'
};

const findProvinceByName = async (name) => {
  const raw = String(name || '').trim();
  if (!raw) return null;

  const alias = provinceAliases[stripDiacritics(raw).toLowerCase()];
  if (alias) return Province.findOne({ name: { $regex: `^${escapeRegex(alias)}$`, $options: 'i' } });

  const exact = await Province.findOne({ name: { $regex: `^${escapeRegex(raw)}$`, $options: 'i' } });
  if (exact) return exact;

  // Fallback sin tildes: los nombres guardados en Mongo las conservan.
  const wanted = stripDiacritics(raw).toLowerCase();
  const candidates = await Province.find({}).select('name');
  const match = candidates.find((p) => stripDiacritics(p.name).toLowerCase() === wanted);
  return match ? Province.findById(match._id) : null;
};

// @desc    Get departments (partidos/departamentos/comunas) by province NAME
// @route   GET /api/v1/locations/provinces/name/:provinceName/departments
// @access  Public
exports.getDepartmentsByProvinceName = async (req, res, next) => {
  try {
    const province = await findProvinceByName(req.params.provinceName);

    if (!province) {
      return res.status(404).json([]);
    }

    const departments = await Department.find({ province: province._id }).sort('name');
    return res.status(200).json(departments.map(d => ({ name: d.name, id: d._id })));
  } catch (error) {
    res.status(400).json([]);
  }
};

// @desc    Get cities/neighborhoods by province NAME (not ID)
// @route   GET /api/v1/locations/provinces/name/:provinceName/cities
// @access  Public
exports.getCitiesByProvinceName = async (req, res, next) => {
  try {
    const province = await findProvinceByName(req.params.provinceName);

    if (!province) {
      return res.status(404).json([]);
    }

    if (province.name === 'CABA') {
      const neighborhoods = await Neighborhood.find({ province: province._id }).sort('name');
      return res.status(200).json(neighborhoods.map(n => ({ name: n.name, id: n._id })));
    }

    const cities = await City.find({ province: province._id }).sort('name');
    return res.status(200).json(cities.map(c => ({ name: c.name, id: c._id })));
  } catch (error) {
    res.status(400).json([]);
  }
};