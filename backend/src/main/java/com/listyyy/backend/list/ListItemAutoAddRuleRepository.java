package com.listyyy.backend.list;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ListItemAutoAddRuleRepository extends JpaRepository<ListItemAutoAddRule, UUID> {

    List<ListItemAutoAddRule> findByEnabledTrueAndNextRunAtLessThanEqual(Instant now);

    Optional<ListItemAutoAddRule> findByListIdAndProductId(UUID listId, UUID productId);

    Optional<ListItemAutoAddRule> findByListIdAndCustomNameHe(UUID listId, String customNameHe);

    List<ListItemAutoAddRule> findByListId(UUID listId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM ListItemAutoAddRule r WHERE r.list.id = :listId")
    void deleteByListId(UUID listId);

    @Modifying(flushAutomatically = true)
    @Query("DELETE FROM ListItemAutoAddRule r WHERE r.product.id = :productId")
    void deleteByProductId(UUID productId);

    @Modifying(flushAutomatically = true)
    @Query("DELETE FROM ListItemAutoAddRule r WHERE r.product.id IN (SELECT p.id FROM Product p WHERE p.category.id = :categoryId)")
    void deleteByProductCategoryId(UUID categoryId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("UPDATE ListItemAutoAddRule r SET r.category = NULL WHERE r.category.id = :categoryId")
    void clearCategoryReferences(UUID categoryId);
}
