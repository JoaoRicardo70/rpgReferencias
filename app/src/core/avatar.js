import { imagemFalhou, resultadoDaImagem, verificarImagem } from './imagemVerificada';

const temTexto = (v) => typeof v === 'string' && v.trim() !== '';

// Imagens de uma Forma ativa, da mais específica para a menos: Configuração escolhida, depois a Forma.
function imagensDaForma(entidade) {
    if (!entidade || !entidade.formaAtivaId || !Array.isArray(entidade.formas)) return null;
    const forma = entidade.formas.find(f => f && f.id === entidade.formaAtivaId);
    if (!forma) return null;
    const configId = forma.configAtivaId != null ? forma.configAtivaId : entidade.configAtivaId;
    const config = configId != null && Array.isArray(forma.configs) ? forma.configs.find(c => c && c.id === configId) : null;
    const imgs = [];
    if (config && temTexto(config.imagemUrl)) imgs.push(config.imagemUrl);
    if (temTexto(forma.imagemUrl)) imgs.push(forma.imagemUrl);
    return imgs.length ? { imgs, nome: forma.nome || entidade.nome } : null;
}

// Tudo que pode mudar a imagem do personagem, na ordem em que vale (o último ativo vence): cada item traz as
// imagens dele da mais para a menos específica (Configuração, Forma e, num poder, a imagem do próprio poder).
function coletarSubstituicoes(ficha) {
    const lista = [];
    if (Array.isArray(ficha.poderes)) {
        for (let j = 0; j < ficha.poderes.length; j++) {
            const p = ficha.poderes[j];
            if (!p || !p.ativa) continue;
            const daForma = imagensDaForma(p);
            const imgs = daForma ? [...daForma.imgs] : [];
            if (temTexto(p.imagemUrl)) imgs.push(p.imagemUrl);
            if (imgs.length) lista.push({ imgs, nome: daForma ? daForma.nome : p.nome });
        }
    }
    if (Array.isArray(ficha.seresSelados)) {
        for (let j = 0; j < ficha.seresSelados.length; j++) {
            const s = ficha.seresSelados[j];
            if (!s || !s.ativo) continue;
            const daForma = imagensDaForma(s);
            if (daForma) lista.push({ imgs: daForma.imgs, nome: daForma.nome });
        }
    }
    return lista;
}

// Imagem do personagem: a base da ficha, ou a do último poder/ser selado ativo que tenha imagem própria
// (a do poder em si ou a da Forma/Configuração ativa dele; a Forma vence a imagem do poder).
export function infoAvatarDaFicha(ficha) {
    if (!ficha) return { img: '', forma: null };
    const resultado = { img: ficha.avatar ? ficha.avatar.base : '', forma: null };
    const lista = coletarSubstituicoes(ficha);
    // Do último ativo para o primeiro: vale a primeira imagem que não se sabe quebrada. Quem a exibe testa o
    // carregamento (verificarImagem) e, se ela falhar, o Mapa é redesenhado (ver assinarFalhasDeImagem) e cai
    // para a próxima em vez de mostrar um quadro preto.
    for (let i = lista.length - 1; i >= 0; i--) {
        const img = lista[i].imgs.find(u => !imagemFalhou(u));
        if (!img) continue;
        if (resultadoDaImagem(img) === undefined) verificarImagem(img);
        resultado.img = img;
        resultado.forma = lista[i].nome;
        break;
    }
    return resultado;
}

// Todas as imagens que podem representar o personagem agora, da preferida para a reserva, terminando na foto
// base. Quem exibe usa a primeira que realmente carrega (link expirado/quebrado não deve deixar o quadro preto).
export function imagensDaFicha(ficha) {
    if (!ficha) return [];
    const candidatas = [];
    const lista = coletarSubstituicoes(ficha);
    for (let i = lista.length - 1; i >= 0; i--) candidatas.push(...lista[i].imgs);
    if (ficha.avatar && temTexto(ficha.avatar.base)) candidatas.push(ficha.avatar.base);
    return candidatas.filter((img, i) => candidatas.indexOf(img) === i);
}
