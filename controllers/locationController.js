const Province = require('../models/Province');
const City = require('../models/City');
const Neighborhood = require('../models/Neighborhood');

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

// @desc    Get cities/neighborhoods by province NAME (not ID)
// @route   GET /api/v1/locations/provinces/name/:provinceName/cities
// @access  Public
exports.getCitiesByProvinceName = async (req, res, next) => {
  try {
    const provinceName = req.params.provinceName;
    const province = await Province.findOne({ name: { $regex: `^${provinceName}$`, $options: 'i' } });

    if (!province) {
      return res.status(404).json([]);
    }

    if (province.name === 'CABA') {
      const neighborhoods = await Neighborhood.find({ province: province._id }).sort('name');
      return res.status(200).json(neighborhoods.map(n => ({ name: n.name, id: n._id })));
    } else {
      const cities = await City.find({ province: province._id }).sort('name');
      return res.status(200).json(cities.map(c => ({ name: c.name, id: c._id })));
    }
  } catch (error) {
    res.status(400).json([]);
  }
};