import mongoose from 'mongoose';
import log from '../utils/logger.gen';

export function connect(mongoUrl:string): mongoose.Connection {
  mongoose.connect(mongoUrl, {
    autoCreate: true,
  });

  mongoose.connection.on('open', () => {
    log.ok('MongoDB Connection open : ' + mongoUrl);
  });

  mongoose.connection.on('error', (err: any) => {
    log.error('MongoDB Connection error:', err.message, err)
  });

  return mongoose.connection;
}


const mongo = {
  connect,
}

export default mongo;