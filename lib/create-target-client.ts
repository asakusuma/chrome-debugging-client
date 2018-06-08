import { EventEmitter } from "events";
import { IDebuggingProtocolClient } from "./types";
import { Target } from "./../protocol/tot";
import { ICommandRequest, ICommandResponseMessage, IMessage, protocolError } from './protocol-client';

export function createTargetClient(
  target: Target,
  sessionId: string
): IDebuggingProtocolClient {
  return new TargetClient(target, sessionId);
}

/* tslint:disable:max-classes-per-file */
class TargetClient extends EventEmitter
  implements IDebuggingProtocolClient {
  private seq = 0;
  private pendingRequests = new Map<number, CommandRequest>();

  constructor(private target: Target, private sessionId: string) {
    super();
    this.onMessage = this.onMessage.bind(this);
    
    target.receivedMessageFromTarget = this.onMessage;
  }

  public async send(method: string, params?: any): Promise<any> {
    const request = this.createRequest(method, params);
    try {
      const [, response] = await Promise.all([
        this.sendRequest(request),
        this.getResponse(request),
      ]);
      return response;
    } finally {
      this.deleteRequest(request);
    }
  }

  private sendRequest(req: ICommandRequest): Promise<void> {
    const message = JSON.stringify(req);
    return this.target.sendMessageToTarget({
      message,
      sessionId: this.sessionId
    });
  }

  private deleteRequest(req: ICommandRequest): void {
    this.pendingRequests.delete(req.id);
  }

  private async getResponse(request: ICommandRequest) {
    const response = await request.response;

    if (response.error) {
      throw protocolError(response.error);
    }

    return response.result;
  }

  private createRequest(method: string, params: any): ICommandRequest {
    const req = new CommandRequest(this.seq++, method, params);
    this.pendingRequests.set(req.id, req);
    return req;
  }

  public onMessage(data: Target.ReceivedMessageFromTargetParameters) {
    console.log('got message', data);
    try {
      const msg: IMessage = JSON.parse(data.message);
      if (msg.id !== undefined) {
        const request = this.pendingRequests.get(msg.id);
        if (request) {
          request.resolve(msg);
        }
      } else {
        this.emit(msg.method, msg.params);
      }
    } catch (err) {
      this.onError(err);
    }
  }

  public close(): Promise<void> {
    return Promise.resolve();
  }

  public onClose() {
    this.clearPending(new Error("socket disconnect"));
    this.emit("close");
  }

  public onError(err: Error) {
    this.clearPending(err);
    this.emit("error", err);
  }

  public async dispose() {
  }

  private clearPending(err: Error) {
    if (this.pendingRequests.size) {
      this.pendingRequests.forEach(req => {
        req.reject(err);
      });
      this.pendingRequests.clear();
    }
  }
}

class CommandRequest implements ICommandRequest {
  public response: Promise<ICommandResponseMessage>;
  public resolve: (res: ICommandResponseMessage) => void;
  public reject: (reason: any) => void;

  constructor(public id: number, public method: string, public params: any) {
    this.response = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}