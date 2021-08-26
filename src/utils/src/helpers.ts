import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import config from './config';
import { EventEmitter } from 'events';

export const parseToFloat = (string: string) => (string ? parseFloat(string.replace(',', '.')) : 0);

/**
 * validates email against a valid regex
 * @param email
 */
export const validateEmail = (email: string) => {
  const re =
    /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return re.test(email);
};

/**
 * encrypt inputed password with generated salt
 * @param password
 */
export const encrypt = (password: string) => {
  return new Promise<{ password: string; salt: string }>((resolve, reject) => {
    bcrypt.genSalt(config.hashSalt, async (err, salt) => {
      if (err) {
        reject('hashing failed');
        return;
      }
      const _password = await bcrypt.hash(password, salt);
      resolve({ password: _password, salt });
      return;
    });
  });
};

/**
 *
 * Compare inputed password with hash from database
 * @param password
 * @param hash
 */
export const canDecrypt = (password: string, hash: string) => {
  return new Promise<boolean>((resolve, reject) => {
    bcrypt.compare(password, hash, function (err, result) {
      if (err) {
        reject('password decrypt failed');
        return;
      }
      resolve(result);
      return;
    });
  });
};

export function capitalizeFirstLetter(string: string) {
  return string ? string.charAt(0).toUpperCase() + string.slice(1) : '';
}

/**
 * @param payload @typedef T
 * sign payload to jwt token
 */
export const jwtSign = <T = {}>(payload: T, secret?: string, options?: SignOptions): Promise<string> => {
  return new Promise((resolve, reject) => {
    jwt.sign(
      payload as any,
      secret ?? config.jwt.secret.authTokenVerification,
      options as SignOptions,
      async (err: any, token: any) => {
        if (err) {
          console.error(err);

          reject(
            new Error(
              'Verification link expired, please request for another verification token to be sent to your email'
            )
          );
          return;
        }

        resolve(token);
        return;
      }
    );
  });
};

/**
 * @param token
 * verify token  and return payload
 */
export const jwtVerify = (token: string, secret?: string) => {
  return new Promise((resolve, reject) => {
    jwt.verify(token as any, secret ?? config.jwt.secret.authTokenVerification, async (err: any, payload: any) => {
      if (err) {
        reject(
          new Error('Verification link expired, please request for another verification token to be sent to your email')
        );
        return;
      }

      resolve(payload);
      return;
    });
  });
};

/**
 * Convert JS date to SQL format
 */
export const getCurrentDate = () => {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
};

export const randomNumberGenerator = () => {
  // returns a random integer from 0 to 9

  const precision = 100; // 2 decimals
  const randomNumber = Math.floor(Math.random() * (10 * precision - 1 * precision) + 1 * precision) / (1 * precision);
  return randomNumber;
};

export const globalEmitter = new EventEmitter();
