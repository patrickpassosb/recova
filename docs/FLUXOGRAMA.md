---
type: Note
title: "Fluxograma Search Recovery - Jornada do Usuário"
updated: "2026-08-06"
related_to: "[[agents-for-commerce-deco]]"
---

# Fluxograma — Search Recovery Agent (Jornada do Usuário)

Fluxograma criado no Excalidraw a partir do rascunho do Patrick (06/08). Arquivos:
- **Editável:** [[attachments/search-recovery-fluxograma.excalidraw]] (abrir em excalidraw.com ou Obsidian Excalidraw plugin)
- **Imagem:** [[attachments/search-recovery-fluxograma.png]]

> 💡 **Como abrir o .excalidraw no Obsidian:** instale o plugin "Excalidraw" na comunidade, ou abra o arquivo em https://excalidraw.com (importar arquivo).

## Fluxo completo

```
┌─────────────────────────────────────────────────────────────────┐
│  PESQUISA DO PRODUTO NA FAIXA (busca nativa)                    │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  AGENTE DE IA ENTRA COMO CHAT                                   │
│  automaticamente mostra 3+ produtos relevantes em <2s           │
└──────────────┬──────────────────────────────┬───────────────────┘
               │                              │
               ▼                              ▼
┌──────────────────────────┐   ┌──────────────────────────────────┐
│ CLIENTE COMPROU UMA DAS  │   │ CLIENTE RESPONDE À PERGUNTA      │
│ SUGESTÕES                │   └──────────────┬───────────────────┘
└──────────────┬───────────┘                  ▼
               │              ┌──────────────────────────────────┐
               ▼              │ RESPONDE A PERGUNTA              │
      ┌──────────────┐        └──────────────┬───────────────────┘
      │ ✅ SUCESSO   │                       ▼
      │ (VERDE)      │      ┌──────────────────────────────────┐
      └──────────────┘      │ 3+ PRODUTOS RELEVANTES PARA A    │
                            │ RESPOSTA + 1 EXPLICAÇÃO DO PORQUÊ │
                            │ + 1 PERGUNTA (LOOP ↺)            │
                            └──────────────┬───────────────────┘
                                           │ (loop ↺)
                                           ▼
        ┌──────────────────────────────────────────────────┐
        │ NÃO RESPONDEU A NENHUMA PERGUNTA NEM ADICIONOU   │
        │ AO CARRINHO                                      │
        └──────────────────────────┬───────────────────────┘
                                   ▼
        ┌──────────────────────────────────────────────────┐
        │ ESPERAR 30 SEGUNDOS E ENVIAR MAIS UMA MENSAGEM   │
        │ DE PERGUNTA (LOOP ↺)                             │
        └──────────────────────────┬───────────────────────┘
                                   ▼
        ┌──────────────────────────────────────────────────┐
        │ ❌ NÃO ADICIONOU NADA NO CARRINHO (VERMELHO)     │
        └──────────────────────────────────────────────────┘
```

## Elementos do fluxograma (24 no Excalidraw)

### Blocos
| ID | Texto | Cor |
|---|---|---|
| r1 | Pesquisa do produto na faixa de busca | cinza |
| r2 | Agente de IA entra como chat: 3+ produtos relevantes em <2s | azul |
| r3 | Cliente comprou uma das sugestões | cinza |
| r4 | ✅ SUCESSO — Conversão concluída | **verde** |
| r5 | Cliente responde à pergunta | cinza |
| r6 | Agente responde: 3+ produtos relevantes | laranja |
| r7 | + 1 explicação do porquê + 1 nova pergunta (LOOP ↺) | laranja |
| r8 | Não respondeu a nenhuma pergunta nem adicionou | cinza |
| r9 | Esperar 30s e enviar mais uma pergunta (LOOP ↺) | laranja |
| r10 | ❌ Não adicionou nada no carrinho | **vermelho** |

### Anotação (configuração do lojista)
> ⚙ Configuração do lojista: 1 pergunta ou 3 respostas pré-definidas (opção de escrita manual)

## Referências do mercado (como os players entregam valor)

- **Alhena (a mais próxima):** pergunta de refinamento → 3+ produtos MATCH/PARTIAL + explicação — mesmo padrão do nosso loop central
- **Constructor ASA / Algolia Agent Studio:** agente conversacional com perguntas de refinamento e recomendações grounded no catálogo
- **Doofinder/Klevu:** autocomplete + correção de typos (nosso ramo de timeout é um diferencial — ninguém faz reengajamento com 30s)

## Decisões de design derivadas do fluxograma

1. **Proatividade:** agente NÃO espera o shopper perguntar — entra com 3+ produtos em <2s
2. **Loop de resposta:** cada resposta gera 3+ produtos + explicação + nova pergunta (conversa infinita até conversão ou desistência)
3. **Reengajamento:** 30s sem ação → nova pergunta (recupera abandonos)
4. **Estados terminais claros:** ✅ verde (conversão) / ❌ vermelho (sem conversão) — ótimo para a demo do vídeo
5. **Configurabilidade:** lojista define 1 pergunta ou 3 respostas pré-definidas (ou escreve manualmente)
