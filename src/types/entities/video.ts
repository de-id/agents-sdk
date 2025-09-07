export enum VideoType {
    Clip = 'clip',
    Talk = 'talk',
    Expressive = 'expressive',
}

export const mapVideoType = (type: string): VideoType => {
    switch (type) {
        case 'clip':
            return VideoType.Clip;
        case 'talk':
            return VideoType.Talk;
        default:
            throw new Error(`Unknown video type: ${type}`);
    }
};
