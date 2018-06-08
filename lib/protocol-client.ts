export interface ICommandRequest {
  id: number;
  method: string;
  params: any;

  response: Promise<ICommandResponseMessage>;
}

export interface IEventMessage {
  method: string;
  params: any;
}

export interface ISuccessResponseMessage {
  id: number;
  result: any;
}

export interface IResponseError {
  code: number;
  message: string;
  data?: string;
}

export interface IErrorResponseMessage {
  id: number;
  error: IResponseError;
}

export interface IMessage
  extends IEventMessage,
    ISuccessResponseMessage,
    IErrorResponseMessage {}

export interface ICommandResponseMessage
  extends ISuccessResponseMessage,
    IErrorResponseMessage {}

export type ProtocolError = Error & { code: number };

export function protocolError({ message, code, data }: IResponseError): ProtocolError {
  const msg = data ? `${message}:${data}` : message;
  const err = new Error(msg);
  return Object.assign(err, { code });
}
