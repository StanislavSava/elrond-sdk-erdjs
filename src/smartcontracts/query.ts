import { ContractFunction } from "./function";
import { Argument } from "./argument";
import { Balance } from "../balance";
import { Address } from "../address";
import { guardValueIsSet } from "../utils";
import { GasLimit } from "../networkParams";
import * as errors from "../errors";
import BigNumber from "bignumber.js";

const MaxUint64 = new BigNumber("18446744073709551615");

export class Query {
    caller: Address;
    address: Address;
    func: ContractFunction;
    args: Argument[];
    value: Balance;

    constructor(init?: Partial<Query>) {
        this.caller = new Address();
        this.address = new Address();
        this.func = ContractFunction.none();
        this.args = [];
        this.value = Balance.Zero();

        Object.assign(this, init);

        guardValueIsSet("address", this.address);
        guardValueIsSet("func", this.func);

        this.address.assertNotEmpty();
        this.args = this.args || [];
        this.caller = this.caller || new Address();
        this.value = this.value || Balance.Zero();
    }

    toHttpRequest() {
        let request: any = {
            "scAddress": this.address.bech32(),
            "funcName": this.func.toString(),
            "args": this.args.map(arg => arg.valueOf()),
            "value": this.value.toString()
        };

        if (!this.caller.isEmpty()) {
            request["caller"] = this.caller.bech32();
        }

        return request;
    }
}

export class QueryResponse {
    private vmOutput: any;

    returnData: ContractReturnData[] = [];
    returnCode: string = "";
    returnMessage: string = "";
    gasUsed: GasLimit = GasLimit.min();

    /**
     * Constructs a QueryResponse object from a HTTP response (as returned by the provider).
     */
    static fromHttpResponse(payload: any): QueryResponse {
        let result = new QueryResponse();

        result.vmOutput = payload;
        result.returnData = ContractReturnData.fromArray(payload["returnData"] || payload["ReturnData"] || []);
        result.returnCode = payload["returnCode"] || (payload["ReturnCode"]).toString() || "";
        result.returnMessage = payload["returnMessage"] || payload["ReturnMessage"] || "";

        let gasRemaining = new BigNumber(payload["gasRemaining"] || payload["GasRemaining"] || 0);
        let gasUsed = MaxUint64.minus(gasRemaining);
        result.gasUsed = new GasLimit(Number(gasUsed.toString(10)));

        return result;
    }

    assertSuccess() {
        if (this.isSuccess()) {
            return;
        }

        throw new errors.ErrContract(`${this.returnCode}: ${this.returnMessage}`);
    }

    isSuccess(): boolean {
        let ok = this.returnCode == "ok" || this.returnCode == "0";
        return ok;
    }

    firstResult(): ContractReturnData {
        let first = this.returnData[0];
        return first;
    }

    buffers(): Buffer[] {
        return this.returnData.map(data => data.asBuffer);
    }

    /**
     * Converts the object to a pretty, plain JavaScript object.
     */
    toJSON(): object {
        return {
            success: this.isSuccess(),
            returnData: this.returnData,
            returnCode: this.returnCode,
            returnMessage: this.returnMessage,
            gasUsed: this.gasUsed.valueOf()
        };
    }
}

// TODO: use types & codecs
export class ContractReturnData {
    asBuffer: Buffer;
    asBase64: any;
    asHex: string;
    asNumber: number;
    asBool: boolean;
    asBigInt: BigNumber;
    asString: string;

    constructor(asBase64: any) {
        this.asBase64 = asBase64 || "";
        this.asBuffer = Buffer.from(this.asBase64, "base64");
        this.asHex = this.asBuffer.toString("hex");
        this.asNumber = parseInt(this.asHex, 16) || 0;
        this.asBigInt = new BigNumber(`0x${this.asHex || "00"}`, 16);
        this.asString = this.asBuffer.toString();
        this.asBool = this.asNumber != 0 && this.asString !== "false" && this.asString !== "" && !this.asBigInt.eq(0, 10);
    }

    static fromArray(raw: any[]): ContractReturnData[] {
        let result = raw.map(item => new ContractReturnData(item));
        return result;
    }
}
