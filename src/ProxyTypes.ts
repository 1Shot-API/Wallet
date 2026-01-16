import { IUserModel } from "types/models";
import {
  BigNumberString,
  EVMAccountAddress,
  JSONString,
  UnixTimestamp,
  Username,
} from "types/primitives";

export const rpcCallbackEventName = "rpcCallback";

export interface IRPCWrapperParams<T> {
  eventName: string;
  callbackNonce: number;
  params: T;
}

export interface IRPCWrapperReturn {
  success: boolean;
  callbackNonce: number;
  result: JSONString;
}

export interface IAuthenticationResult {
  success: boolean;
  walletUnlocked: boolean;
  user?: IUserModel;
  error?: string;
  canRetry?: boolean;
}

export interface ISignInParams {
  username: Username;
}


export interface IGetERC3009SignatureParams {
  recipient: string;
  destinationAddress: EVMAccountAddress;
  amount: BigNumberString;
  validUntil: UnixTimestamp;
  validAfter: UnixTimestamp;
}

export interface IGetPermitSignatureParams {
  recipient: string;
  destinationAddress: EVMAccountAddress;
  amount: BigNumberString;
  nonce: BigNumberString;
  deadlineSeconds: number;
}

export interface ICreateDelegationParams {}

export interface IGetAccountAddressResponse {
  accountAddress: EVMAccountAddress;
}
