export default class AgentAPI {
    private testProp: number;

    constructor() {
        this.testProp = 42;
    }

    protected test(msg: string) {
        console.log(msg)
    }

    protected getTestProp() {
        return this.testProp
    }
}