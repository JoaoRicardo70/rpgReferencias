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

// Ficha de onde sai a imagem de um token do Mapa. O token de um NPC da Gaveta (dummie) não tem avatar próprio: a imagem é a da ficha
// de origem (fichaOrigem), com as Formas ativas dela. Um token que tenha avatar próprio, ou sem ficha de origem, usa o que tem.
export function fichaVisualDoToken(entidade, personagens) {
    if (!entidade || typeof entidade !== 'object') return entidade;
    if (entidade.avatar && temTexto(entidade.avatar.base)) return entidade;
    const origem = entidade.fichaOrigem && personagens ? personagens[entidade.fichaOrigem] : null;
    return origem && typeof origem === 'object' ? origem : entidade;
}

// A moldura tem uma JANELA transparente no meio? Recebe os pixels RGBA (como getImageData) de uma miniatura da moldura e olha o miolo
// (o terço central): com pelo menos 20% de pixels bem transparentes, tem janela. Sem janela (PNG opaco / JPG) o recorte esconderia a foto.
export function molduraTemJanela(rgba, largura, altura) {
    if (!rgba || !(largura > 0) || !(altura > 0) || rgba.length < largura * altura * 4) return null;
    const x0 = Math.floor(largura / 3); const x1 = Math.ceil((largura * 2) / 3);
    const y0 = Math.floor(altura / 3); const y1 = Math.ceil((altura * 2) / 3);
    let total = 0; let transparentes = 0;
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            total += 1;
            if (rgba[(y * largura + x) * 4 + 3] < 128) transparentes += 1;
        }
    }
    return total > 0 && transparentes / total >= 0.2;
}

// Recorte da foto pela JANELA da moldura: a foto só aparece onde a moldura (PNG transparente) é transparente, então nunca passa por
// cima da arte da moldura. Vale só no modo "normal" (PNG transparente): moldura de fundo preto/branco (screen/multiply) não tem janela
// transparente e esconderia a foto inteira. A moldura é desenhada num quadro 106% x 107% centrado na foto (ver Marcados.jsx).
// Devolve o estilo (inline, valor dinâmico) a somar ao da foto, ou {} quando não se aplica.
export function recorteDaFotoPelaMoldura(urlMoldura, modo, ativo = true) {
    if (!ativo || modo !== 'normal' || !temTexto(urlMoldura)) return {};
    const url = `url("${String(urlMoldura).replace(/["\\\n\r]/g, '')}")`;
    const imagens = `linear-gradient(#000, #000), ${url}`;
    return {
        WebkitMaskImage: imagens, maskImage: imagens,
        WebkitMaskSize: '100% 100%, 106% 107%', maskSize: '100% 100%, 106% 107%',
        WebkitMaskPosition: '0 0, center', maskPosition: '0 0, center',
        WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
        WebkitMaskComposite: 'xor', maskComposite: 'exclude',
    };
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
