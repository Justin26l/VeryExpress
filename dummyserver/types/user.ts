/* eslint-disable */
/**
 * Generated by json2express-api@[unknown version]
 * DO NOT MODIFY MANUALLY. Instead, modify the source JSONSchema file,
 * and run json2express-api to regenerate this file.
 *
 * author: justin26l
 * version: [unknown version]
 */

export interface User {
  _id?: string;
  name?: string;
  userContact?: {
    phoneNo?: string;
    /**
     * timestamp
     */
    deleted?: number;
    /**
     * timestamp
     */
    created?: number;
    [k: string]: unknown;
  }[];
  isActive?: boolean;
  /**
   * timestamp
   */
  created?: number;
  /**
   * timestamp
   */
  createdBy?: string;
  /**
   * timestamp
   */
  updated?: number;
  /**
   * timestamp
   */
  updatedBy?: string;
}