import React, { memo } from 'react';
import useStore from '../../stores/useStore';
import { imagensDaFicha } from '../../core/avatar';
import { useImagemQueCarrega } from '../../hooks/useImagemQueCarrega';
import { urlSeguraParaCss } from '../mapa/MapaVoz';

// Imagem redonda do personagem (a mesma do Mapa: base da ficha ou forma ativa).
// Sem imagem cadastrada, mostra a inicial do nome.
function AvatarPersonagem({ nome, tamanho = 32 }) {
    // Seletores estreitos: só re-renderiza quando a ficha DESTE personagem muda (não a cada tique de vida dos outros).
    const souEu = useStore(s => s.meuNome === nome);
    const fichaDaMesa = useStore(s => s.personagens?.[nome]);
    const minhaFicha = useStore(s => (s.meuNome === nome ? s.minhaFicha : null));

    const ficha = souEu ? (minhaFicha || fichaDaMesa) : fichaDaMesa;
    const img = useImagemQueCarrega(imagensDaFicha(ficha));
    const fundo = urlSeguraParaCss(img);

    return (
        <span
            className={`avatar-com${fundo ? '' : ' sem-imagem'}`}
            style={{ width: tamanho, height: tamanho, fontSize: Math.round(tamanho * 0.45), backgroundImage: fundo || 'none' }}
            title={nome}
            aria-hidden="true"
        >
            {fundo ? '' : (nome || '?').charAt(0).toUpperCase()}
        </span>
    );
}

export default memo(AvatarPersonagem);
