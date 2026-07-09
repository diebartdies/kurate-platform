const mongoose = require('mongoose');

const argNumGeoSchema = new mongoose.Schema({
    operador: String,
    servicio: String,
    modalidad: String,
    localidad: String,
    indicativo: String,
    bloque: String,
    resolucion: String,
    fecha: String
});

module.exports = mongoose.model('ArgNumGeo', argNumGeoSchema, 'Arg_num_geo');