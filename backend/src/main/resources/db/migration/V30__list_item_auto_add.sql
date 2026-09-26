-- Automatic replenishment rules for list items.
-- A rule survives deletion of the list item itself so the scheduler can re-add it later.
CREATE TABLE list_item_auto_add_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    custom_name_he VARCHAR(255),
    category_id UUID REFERENCES categories(id),
    quantity DECIMAL(12,3) NOT NULL DEFAULT 1,
    unit VARCHAR(50) DEFAULT 'יחידה',
    note TEXT,
    icon_id VARCHAR(64),
    item_image_url VARCHAR(2048),
    every_n INT NOT NULL,
    every_unit VARCHAR(20) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    next_run_at TIMESTAMP WITH TIME ZONE,
    version BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT auto_add_product_or_custom CHECK (
        (product_id IS NOT NULL AND custom_name_he IS NULL) OR
        (product_id IS NULL AND custom_name_he IS NOT NULL)
    )
);

CREATE INDEX idx_auto_add_rules_list ON list_item_auto_add_rules(list_id);
CREATE INDEX idx_auto_add_rules_due ON list_item_auto_add_rules(enabled, next_run_at);
CREATE UNIQUE INDEX uq_auto_add_list_product ON list_item_auto_add_rules(list_id, product_id);
CREATE UNIQUE INDEX uq_auto_add_list_custom ON list_item_auto_add_rules(list_id, custom_name_he);
