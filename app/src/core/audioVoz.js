// Detecção de voz da Sala da Party: mede o nível na faixa da fala e decide quando o microfone "abre".
// Lógica pura (sem React nem WebAudio) para ser testável. Usada pelo portão de ruído (useVoiceChat),
// pelo calibrador e pelo brilho dos cartões (MapaVoz).

export const FFT_SIZE = 256;
export const FAIXA_VOZ_HZ = [100, 3800];
// A escala do nível é a do AnalyserNode.getByteFrequencyData (0-255 entre -100 e -30 dB).
export const NIVEL_MAXIMO_EXIBIDO = 140;
// Ajuste do usuário (limiar mínimo de abertura) na mesma escala: faixa do controle e valor inicial.
export const SENSIBILIDADE_MIN = 1;
export const SENSIBILIDADE_MAX = 120;
export const SENSIBILIDADE_PADRAO = 30;

// Estado compartilhado entre o portão (que escreve) e a interface (que lê a cada quadro, sem re-render):
// o limiar EFETIVO de abertura (o maior entre o ajuste do usuário e o piso de ruído + margem).
export const estadoPortao = { ativo: false, aberto: false, piso: 0, limiar: 0 };

// Faixa de bins do analisador que cobre a fala (ignora o zumbido grave e o chiado agudo).
export function faixaDeVoz(sampleRate = 48000, fftSize = FFT_SIZE) {
    const larguraBin = sampleRate / fftSize;
    const maximo = fftSize / 2 - 1;
    const ini = Math.min(maximo - 1, Math.max(1, Math.floor(FAIXA_VOZ_HZ[0] / larguraBin)));
    const fim = Math.min(maximo, Math.max(ini + 1, Math.ceil(FAIXA_VOZ_HZ[1] / larguraBin)));
    return { ini, fim };
}

// Média do espectro (bytes) dentro da faixa da voz.
export function medirNivelDeVoz(dados, faixa) {
    const { ini, fim } = faixa;
    let soma = 0;
    let n = 0;
    for (let i = ini; i <= fim && i < dados.length; i++) { soma += dados[i]; n++; }
    return n ? soma / n : 0;
}

export const CONFIG_PORTAO_PADRAO = {
    margemAbrir: 28,      // ~8 dB acima do piso de ruído: fala fica 15-30 dB acima, ruídos comuns bem menos
    histerese: 4,         // fecha só quando cai abaixo de (limiar de abertura - histerese)
    segurarMs: 700,       // mantém aberto depois da última voz (não corta o fim das palavras)
    quadrosParaAbrir: 4,  // ~66 ms de som sustentado: o pico de um clique tem cauda de ~3 quadros e não abre
    subidaDoPiso: 0.0008, // com o portão fechado, o piso sobe devagar (ruído constante é "aprendido")
    descidaDoPiso: 0.3,   // e desce rápido quando o ambiente silencia
    // Ruído constante que abriu o portão (ex.: ventilador ligado de repente): fala oscila a cada sílaba;
    // um nível que quase não muda por vários segundos é ruído, então vira o novo piso e o portão fecha.
    desvioEstavel: 8,     // desvio-padrão do nível na janela abaixo disso = "parado" (fala passa de 15)
    janelaEstavelMs: 1500,
    estavelMs: 5000,
};

// Portão de ruído: chame `processar(nivel, sensibilidade, agoraMs)` a cada quadro de análise.
export function criarPortaoDeVoz(config = {}) {
    const cfg = { ...CONFIG_PORTAO_PADRAO, ...config };
    let piso = null;
    let aberto = false;
    let acima = 0;
    let ultimaVoz = 0;
    let historico = []; // [{ t, nivel }] da janela recente, só enquanto o portão está aberto
    let desdeEstavel = null;

    return {
        processar(nivel, sensibilidade, agoraMs) {
            if (piso === null) piso = Math.min(nivel, sensibilidade);
            // O piso só aprende com o portão fechado: senão a própria fala viraria "ruído de fundo".
            if (!aberto) piso += (nivel - piso) * (nivel < piso ? cfg.descidaDoPiso : cfg.subidaDoPiso);

            const limiarAbrir = Math.max(sensibilidade, piso + cfg.margemAbrir);
            const limiarFechar = Math.max(sensibilidade - cfg.histerese, piso + cfg.margemAbrir - cfg.histerese);

            // Portão aberto e o nível quase sem oscilar por vários segundos = ruído estacionário (fala oscila
            // a cada sílaba): vira o novo piso e o portão fecha. Mede o desvio na janela, não quadro a quadro.
            if (aberto) {
                historico.push({ t: agoraMs, nivel });
                while (historico.length && agoraMs - historico[0].t > cfg.janelaEstavelMs) historico.shift();
                const janelaCheia = historico.length > 1 && agoraMs - historico[0].t >= cfg.janelaEstavelMs * 0.9;
                let media = 0;
                historico.forEach(h => { media += h.nivel; });
                media /= historico.length || 1;
                let variancia = 0;
                historico.forEach(h => { variancia += (h.nivel - media) ** 2; });
                const desvio = Math.sqrt(variancia / (historico.length || 1));
                if (janelaCheia && desvio <= cfg.desvioEstavel) {
                    if (desdeEstavel === null) desdeEstavel = agoraMs;
                    else if (agoraMs - desdeEstavel > cfg.estavelMs) {
                        piso = media;
                        aberto = false;
                        acima = 0;
                        desdeEstavel = null;
                        historico = [];
                    }
                } else {
                    desdeEstavel = null;
                }
            } else {
                historico = [];
                desdeEstavel = null;
            }

            if (!aberto) {
                if (nivel > limiarAbrir) {
                    acima += 1;
                    if (acima >= cfg.quadrosParaAbrir) { aberto = true; ultimaVoz = agoraMs; }
                } else {
                    // Decai em vez de zerar: fala oscila e cruza o limiar a cada quadro, um clique isolado não.
                    acima = Math.max(0, acima - 1);
                }
            } else if (nivel > limiarFechar) {
                ultimaVoz = agoraMs;
            } else if (agoraMs - ultimaVoz > cfg.segurarMs) {
                aberto = false;
                acima = 0;
            }
            return { aberto, piso, limiarAbrir, limiarFechar };
        },
        reiniciar() { piso = null; aberto = false; acima = 0; ultimaVoz = 0; historico = []; desdeEstavel = null; },
    };
}

// Um som "de fala" para o brilho dos cartões dos OUTROS jogadores (o áudio deles já passou pelo portão
// do remetente): limiar fixo na mesma escala do nível da faixa de voz.
export const LIMIAR_FALA_REMOTA = 25;
