import React, { useState } from 'react';
import { listaDeNomesComAcesso, nomeSeguro } from '../../core/cenasRegiao';

// Botão + painel "quem entra nesta Cena" (só Mestre/Co-Mestre vê). Sem restrição = todos os jogadores;
// com restrição, só os personagens marcados (o Mestre/Co-Mestre sempre entra). Cada clique já salva.
export default function CenaAcesso({ cena, jogadores = [], onSalvar }) {
    const [aberto, setAberto] = useState(false);
    const restrita = !!cena?.restrita;
    const liberados = listaDeNomesComAcesso(cena);

    const rotulo = !restrita ? '👥 Todos' : (liberados.length ? `👥 ${liberados.length} liberado${liberados.length > 1 ? 's' : ''}` : '👥 Só Mestres');

    const alternarTodos = (todos) => onSalvar(todos ? null : liberados);
    const alternarPersonagem = (nome, marcado) => {
        const seguro = nomeSeguro(nome);
        onSalvar(marcado ? [...liberados, seguro] : liberados.filter(n => n !== seguro));
    };

    return (
        <span className="cena-acesso">
            <button type="button" className="cena-acesso-botao" title="Escolher quais personagens podem abrir esta Cena" onClick={() => setAberto(a => !a)}>{rotulo}</button>
            {aberto && (
                <div className="cena-acesso-painel">
                    <label className="cena-acesso-opcao cena-acesso-todos">
                        <input type="checkbox" checked={!restrita} onChange={e => alternarTodos(e.target.checked)} /> Todos os jogadores
                    </label>
                    {restrita && (jogadores.length === 0
                        ? <span className="cena-acesso-vazio">Nenhum personagem na mesa ainda.</span>
                        : jogadores.map(nome => (
                            <label key={nome} className="cena-acesso-opcao">
                                <input type="checkbox" checked={liberados.includes(nomeSeguro(nome))} onChange={e => alternarPersonagem(nome, e.target.checked)} /> {nome}
                            </label>
                        )))}
                </div>
            )}
        </span>
    );
}
