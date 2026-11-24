import { useEffect, useState } from 'react';
import { molduraTemJanela } from '../core/avatar';

// Carrega a moldura numa miniatura e descobre se ela tem janela transparente (core/avatar.js > molduraTemJanela).
// true = tem janela (pode recortar a foto), false = opaca/sem janela (NÃO recortar), null = não deu pra saber (sem moldura, imagem
// que não carrega ou sem permissão de leitura/CORS). Quando não dá pra saber, o recorte por máscara também falha de forma segura
// (a foto aparece inteira), então quem usa pode tratar null como "pode aplicar".
export default function useMolduraTemJanela(url) {
    const [resultado, setResultado] = useState({ url: '', valor: null });

    useEffect(() => {
        if (typeof url !== 'string' || url.trim() === '' || typeof Image === 'undefined' || typeof document === 'undefined') return undefined;
        let cancelado = false;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            let valor = null;
            try {
                const c = document.createElement('canvas');
                c.width = 48; c.height = 72;
                const ctx = c.getContext('2d');
                if (ctx) {
                    ctx.drawImage(img, 0, 0, c.width, c.height);
                    valor = molduraTemJanela(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
                }
            } catch (e) { valor = null; }
            if (!cancelado) setResultado({ url, valor });
        };
        img.onerror = () => { if (!cancelado) setResultado({ url, valor: null }); };
        img.src = url;
        return () => { cancelado = true; };
    }, [url]);

    return resultado.url === url ? resultado.valor : null;
}
