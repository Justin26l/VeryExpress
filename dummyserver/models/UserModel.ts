/* eslint-disable */
/**
 * Generated by json2express-api@[unknown version] 
 * DO NOT MODIFY MANUALLY. Instead, modify the source JSONSchema file,
 * and run json2express-api to regenerate this file.
 * 
 * author: justin26l
 * version: [unknown version]
 */

import { Document, Schema, Model, model } from "mongoose";
import { User } from "../types/user";

const schemaConfig = {
  name: { type: String, index: true },
  userContact: {
    type: [
      {
        phoneNo: { type: String, index: true },
        deleted: { type: Number },
        created: { type: Number }
      }
    ]
  },
  isActive: { type: Boolean },
  created: { type: Number },
  createdBy: { type: String },
  updated: { type: Number },
  updatedBy: { type: String }
};

export interface UserDocument extends User, Document<string> {};
export const userSchema: Schema = new Schema(schemaConfig);
export const UserModel: Model<UserDocument> = model<UserDocument>("user", userSchema);