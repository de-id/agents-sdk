import AgentAPI from './packages/agents/agentAPI';
import { Auth } from './types/auth';

// TODO move to env or constants file
const defaultBasePath = 'https://api-dev.d-id.com'

export class AgentSDK {
    private auth: Auth;
    private basePath = '';

    // constructor(auth: Auth, basePath: string = defaultBasePath) {
    //     this.auth = auth;
    //     this.basePath = basePath;
    // }
    constructor() {
        this.basePath = defaultBasePath;
    }

    get basePathVar() {
        return this.basePath;
    }

    // get agentAPI() {
    //     return new AgentAPI();
    // }
}
