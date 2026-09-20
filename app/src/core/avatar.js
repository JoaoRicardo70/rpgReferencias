const temTexto = (v) => typeof v === 'string' && v.trim() !== '';

// Imagem de uma Forma ativa: a da Configuração escolhida (se tiver imagem), senão a da própria Forma.
function imagemDaForma(entidade) {
    if (!entidade || !entidade.formaAtivaId || !Array.isArray(entidade.formas)) return null;
    const forma = entidade.formas.find(f => f && f.id === entidade.formaAtivaId);
    if (!forma) return null;
    const configId = forma.configAtivaId != null ? forma.configAtivaId : entidade.configAtivaId;
    const config = configId != null && Array.isArray(forma.configs) ? forma.configs.find(c => c && c.id === configId) : null;
    if (config && temTexto(config.imagemUrl)) return { img: config.imagemUrl, nome: forma.nome || entidade.nome };
    if (temTexto(forma.imagemUrl)) return { img: forma.imagemUrl, nome: forma.nome || entidade.nome };
    return null;
}

// Imagem do personagem: a base da ficha, ou a do último poder/ser selado ativo que tenha imagem própria
// (a do poder em si ou a da Forma/Configuração ativa dele; a Forma vence a imagem do poder).
export function infoAvatarDaFicha(ficha) {
    if (!ficha) return { img: '', forma: null };
    const resultado = { img: ficha.avatar ? ficha.avatar.base : '', forma: null };
    const aplicar = (img, nome) => { resultado.img = img; resultado.forma = nome; };

    if (Array.isArray(ficha.poderes)) {
        for (let j = 0; j < ficha.poderes.length; j++) {
            const p = ficha.poderes[j];
            if (!p || !p.ativa) continue;
            const daForma = imagemDaForma(p);
            if (daForma) aplicar(daForma.img, daForma.nome);
            else if (temTexto(p.imagemUrl)) aplicar(p.imagemUrl, p.nome);
        }
    }
    if (Array.isArray(ficha.seresSelados)) {
        for (let j = 0; j < ficha.seresSelados.length; j++) {
            const s = ficha.seresSelados[j];
            if (!s || !s.ativo) continue;
            const daForma = imagemDaForma(s);
            if (daForma) aplicar(daForma.img, daForma.nome);
        }
    }
    return resultado;
}
