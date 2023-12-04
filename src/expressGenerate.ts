import fs from 'fs';
import express from 'express';
// import json2mongoose from 'json2mongoose';

const jsonSchemaDir = './jsonSchema';
const srcDir = './output';

const controllerDir = `${srcDir}/controllers`;
const controllerGenDir = `${controllerDir}/generated`;

const modelDir = `${srcDir}/models`;
const modelGenDir = `${modelDir}/generated`;

const serviceDir = `${srcDir}/services`;
const routeDir = `${srcDir}/routes`;
const middlewareDir = `${srcDir}/middlewares`;
const configDir = `${srcDir}/config`;
const utilsDir = `${srcDir}/utils`;
const typeDir = `${srcDir}/types`;

// create all directories if not exist
fs.mkdirSync(jsonSchemaDir, { recursive: true });
fs.mkdirSync(srcDir, { recursive: true });
fs.mkdirSync(controllerDir, { recursive: true });
fs.mkdirSync(modelDir, { recursive: true });
fs.mkdirSync(serviceDir, { recursive: true });
fs.mkdirSync(routeDir, { recursive: true });
fs.mkdirSync(middlewareDir, { recursive: true });
fs.mkdirSync(configDir, { recursive: true });
fs.mkdirSync(utilsDir, { recursive: true });
fs.mkdirSync(typeDir, { recursive: true });

// run json2mongoose

// template for controller

// const express = require('express')
// const bodyParser = require('body-parser')
// const methodOverride = require('method-override')
// const mongoose = require('mongoose')
// const restify = require('express-restify-mongoose')
// const app = express()
// const router = express.Router()

// app.use(bodyParser.json())
// app.use(methodOverride())

// mongoose.connect('mongodb://localhost:27017/database')

// restify.serve(router, mongoose.model('Customer', new mongoose.Schema({
//   name: { type: String, required: true },
//   comment: { type: String }
// })))

// app.use(router)

// app.listen(3000, () => {
//   console.log('Express server listening on port 3000')
// })