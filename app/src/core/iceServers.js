// Servidores ICE do rádio de voz (WebRTC via PeerJS).
//
// STUN só descobre o endereço público; quando os dois jogadores estão atrás de NATs que não
// aceitam conexão direta (roteadores simétricos, CGNAT, redes de faculdade/empresa) o áudio só
// passa por um servidor TURN de retransmissão. Os TURN públicos "openrelayproject" que o
// projeto usava foram revogados (respondem "400 allocate error"), então o TURN agora vem de
// variáveis de build — VITE_TURN_URLS (separadas por vírgula), VITE_TURN_USERNAME e
// VITE_TURN_CREDENTIAL — para não deixar credenciais mortas no código.

const STUN_PADRAO = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
];

export function montarIceServers(env = {}) {
    const servidores = [...STUN_PADRAO];
    const urls = String(env.VITE_TURN_URLS || '')
        .split(',')
        .map(u => u.trim())
        .filter(Boolean);

    if (urls.length > 0 && env.VITE_TURN_USERNAME && env.VITE_TURN_CREDENTIAL) {
        servidores.push({
            urls,
            username: env.VITE_TURN_USERNAME,
            credential: env.VITE_TURN_CREDENTIAL,
        });
    }
    return servidores;
}

export function temTurnConfigurado(env = {}) {
    return montarIceServers(env).length > STUN_PADRAO.length;
}
