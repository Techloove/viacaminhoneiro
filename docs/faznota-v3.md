> Atualização: consulte [Administração SaaS](administracao-saas.md) para a referência 3.13.0, conexões por empresa e restrições atuais do CIOT. A avaliação anterior abaixo registra a versão consultada na época. Nenhuma emissão está habilitada.

# Referência FazNota v3

Consulta de 21/10/2026: https://faznota.com.br/api/v3/referencia/ carrega https://faznota.com.br/api/openapi/nota-fiscal.yaml (OpenAPI 3.10.0).

O conjunto de rotas é o mesmo do JSON anexado pelo usuário. Não há rotas CIOT. CT-e exige somente numero-origem no schema de emissão, e MDF-e somente id-mdfe: os schemas não representam payloads fiscais completos. Não há GET documentado de consulta de recibos para CT-e/MDF-e. Não inventar consultas por analogia com NF-e.

CT-e OS (modelo 67) é destinado a pessoas, valores ou excesso de bagagem; não é o documento padrão para o fluxo de carga deste aplicativo. NF-e/NFC-e/NFS-e, BP-e e Renave são outros módulos do fornecedor, não escopo automático do SaaS de transporte de cargas.

A Central Fiscal organiza rascunhos locais, exporta JSON interno e apresenta pré-requisitos de eventos. Não chama APIs e não produz documento fiscal válido. Os campos preparatórios não representam todos os campos exigidos pelo fornecedor. Valores fiscais não são calculados. Não existe persistência fiscal nesta versão.

Antes da integração: obter payloads completos, consultas de resultados, homologação, autenticação por emissor e contrato CIOT. Tokens somente no servidor, com permissões por organização, fila durável e reconciliação de resultados incertos. Nunca usar HTTP 200 ou recibo como prova de autorização.
