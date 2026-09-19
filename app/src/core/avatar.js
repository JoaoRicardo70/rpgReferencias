// Imagem do personagem: a base da ficha, ou a da última forma/poder ativo que tenha imagem própria.
export function infoAvatarDaFicha(ficha) {
    if (!ficha) return { img: '', forma: null };
    const resultado = { img: ficha.avatar ? ficha.avatar.base : '', forma: null };
    if (Array.isArray(ficha.poderes)) {
        for (let j = 0; j < ficha.poderes.length; j++) {
            const p = ficha.poderes[j];
            if (p && p.ativa && typeof p.imagemUrl === 'string' && p.imagemUrl.trim() !== '') {
                resultado.img = p.imagemUrl;
                resultado.forma = p.nome;
            }
        }
    }
    return resultado;
}
