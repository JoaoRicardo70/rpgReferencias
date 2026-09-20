// Teste de "esta imagem realmente carrega?" com cache global. Um link quebrado/expirado (ou bloqueado) faz o
// quadro do personagem ficar preto; com isso quem exibe pode cair para a próxima imagem disponível.
const resultados = new Map(); // url -> true (carregou) | false (falhou)
const emAndamento = new Map();
const ouvintes = new Set();

export function resultadoDaImagem(url) {
    return resultados.has(url) ? resultados.get(url) : undefined;
}

export function imagemFalhou(url) {
    return resultados.get(url) === false;
}

// Avisa quem estiver ouvindo quando uma imagem é descoberta como quebrada (para re-desenhar com a reserva).
export function assinarFalhasDeImagem(fn) {
    ouvintes.add(fn);
    return () => ouvintes.delete(fn);
}

export function verificarImagem(url) {
    if (typeof url !== 'string' || url === '') return Promise.resolve(false);
    if (resultados.has(url)) return Promise.resolve(resultados.get(url));
    if (emAndamento.has(url)) return emAndamento.get(url);
    const promessa = new Promise((resolve) => {
        if (typeof Image === 'undefined') { resolve(true); return; }
        const imagem = new Image();
        imagem.onload = () => resolve(true);
        imagem.onerror = () => resolve(false);
        imagem.src = url;
    }).then((ok) => {
        resultados.set(url, ok);
        emAndamento.delete(url);
        if (!ok) {
            console.warn(`[Imagem] não carregou: ${url.slice(0, 80)}${url.length > 80 ? '…' : ''}`);
            ouvintes.forEach(fn => { try { fn(url); } catch (e) { /* ouvinte com erro não pode travar os outros */ } });
        }
        return ok;
    });
    emAndamento.set(url, promessa);
    return promessa;
}

// Só para testes.
export function limparCacheDeImagens() {
    resultados.clear();
    emAndamento.clear();
}
