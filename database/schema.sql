-- Nhật ký Mùa Hè Xanh - MySQL 8+
-- Tạo database riêng nếu tài khoản triển khai có quyền:
-- CREATE DATABASE nhat_ky_mhx CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE nhat_ky_mhx;

SET NAMES utf8mb4;
SET time_zone = '+07:00';

CREATE TABLE users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    display_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NULL,
    password_hash VARCHAR(255) NULL,
    avatar_url VARCHAR(500) NULL,
    role ENUM('reader', 'author', 'moderator', 'admin') NOT NULL DEFAULT 'reader',
    status ENUM('active', 'blocked') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE campaigns (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(180) NOT NULL,
    slug VARCHAR(190) NOT NULL,
    year SMALLINT UNSIGNED NOT NULL,
    location_name VARCHAR(255) NOT NULL,
    province VARCHAR(120) NULL,
    summary TEXT NULL,
    cover_image_url VARCHAR(500) NULL,
    theme_config JSON NULL COMMENT 'Màu, font, họa tiết riêng của chiến dịch',
    status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_campaigns_slug (slug),
    KEY idx_campaigns_year_status (year, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE journals (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    campaign_id BIGINT UNSIGNED NOT NULL,
    author_id BIGINT UNSIGNED NULL,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(190) NOT NULL,
    excerpt TEXT NULL,
    content LONGTEXT NOT NULL,
    content_format ENUM('plain_text', 'html', 'markdown') NOT NULL DEFAULT 'plain_text',
    written_at DATETIME NULL COMMENT 'Ngày ghi trên trang nhật ký',
    event_date DATE NULL COMMENT 'Ngày xảy ra kỷ niệm được kể',
    location_text VARCHAR(255) NULL,
    source_credit VARCHAR(500) NULL,
    cover_image_url VARCHAR(500) NULL,
    closing_message VARCHAR(500) NULL,
    allow_comments BOOLEAN NOT NULL DEFAULT TRUE,
    allow_anonymous_comments BOOLEAN NOT NULL DEFAULT TRUE,
    status ENUM('draft', 'published', 'hidden', 'archived') NOT NULL DEFAULT 'draft',
    published_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_journals_campaign
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_journals_author
        FOREIGN KEY (author_id) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    UNIQUE KEY uq_journals_campaign_slug (campaign_id, slug),
    KEY idx_journals_listing (campaign_id, status, published_at),
    FULLTEXT KEY ft_journals_search (title, excerpt, content)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE journal_media (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    journal_id BIGINT UNSIGNED NOT NULL,
    media_type ENUM('image', 'video') NOT NULL DEFAULT 'image',
    file_url VARCHAR(500) NOT NULL,
    thumbnail_url VARCHAR(500) NULL,
    alt_text VARCHAR(255) NOT NULL,
    caption VARCHAR(500) NULL,
    width_px INT UNSIGNED NULL,
    height_px INT UNSIGNED NULL,
    file_size_bytes BIGINT UNSIGNED NULL,
    mime_type VARCHAR(100) NULL,
    sort_order INT UNSIGNED NOT NULL DEFAULT 0,
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_media_journal
        FOREIGN KEY (journal_id) REFERENCES journals(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    KEY idx_media_journal_order (journal_id, sort_order),
    KEY idx_media_featured (journal_id, is_featured)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE comments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    journal_id BIGINT UNSIGNED NOT NULL,
    parent_id BIGINT UNSIGNED NULL,
    user_id BIGINT UNSIGNED NULL,
    guest_name VARCHAR(100) NULL,
    guest_email_hash CHAR(64) NULL COMMENT 'SHA-256 để nhận diện, không lưu email thô',
    is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
    content TEXT NOT NULL,
    status ENUM('pending', 'approved', 'rejected', 'spam', 'deleted') NOT NULL DEFAULT 'pending',
    ip_hash CHAR(64) NULL COMMENT 'Hash có salt phục vụ chống spam; không lưu IP thô',
    user_agent_hash CHAR(64) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_comments_journal
        FOREIGN KEY (journal_id) REFERENCES journals(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_comments_parent
        FOREIGN KEY (parent_id) REFERENCES comments(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_comments_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT chk_comment_identity CHECK (
        user_id IS NOT NULL OR guest_name IS NOT NULL OR is_anonymous = TRUE
    ),
    KEY idx_comments_thread (journal_id, status, created_at),
    KEY idx_comments_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE comment_reactions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    comment_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NULL,
    visitor_token_hash CHAR(64) NULL,
    reaction ENUM('heart', 'like') NOT NULL DEFAULT 'heart',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_reactions_comment
        FOREIGN KEY (comment_id) REFERENCES comments(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_reactions_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT chk_reaction_identity CHECK (
        (user_id IS NOT NULL AND visitor_token_hash IS NULL)
        OR (user_id IS NULL AND visitor_token_hash IS NOT NULL)
    ),
    UNIQUE KEY uq_reaction_user (comment_id, user_id, reaction),
    UNIQUE KEY uq_reaction_visitor (comment_id, visitor_token_hash, reaction)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE moderation_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    comment_id BIGINT UNSIGNED NOT NULL,
    moderator_id BIGINT UNSIGNED NULL,
    action ENUM('approve', 'reject', 'mark_spam', 'delete', 'restore') NOT NULL,
    note VARCHAR(500) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_moderation_comment
        FOREIGN KEY (comment_id) REFERENCES comments(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_moderation_user
        FOREIGN KEY (moderator_id) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    KEY idx_moderation_comment_time (comment_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
