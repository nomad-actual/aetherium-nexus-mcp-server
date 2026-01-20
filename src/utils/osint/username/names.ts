interface ExtractionRule {
    flags: string[];
    regex?: string;
    extract_json?: boolean;
    url_mutations?: Array<{
        from: string;
        to: string;
        headers?: Record<string, string>;
    }>;
    transforms?: Array<(input: any) => any>;
    fields?: Record<string, (input: any) => any>;
    message?: string;
    bs?: boolean;
}

const html = { unescape: () => '/>' }

function getYandexProfilePic(s: string) {

}

function decodeYaStr(s: string) {

}

function extractFacebookUid(s: string) {
    
}

function getUcozEmail(s: string) {

}

function getUcozUidNode(s: string): any {

}


function getUcozImage(s: string) {

}

function getUcozUserlink(s: string) {

}

function getMymailUid(s: string) {

}

const schemes: Record<string, ExtractionRule> = {
    // unactual
    'Twitter HTML': {
        flags: ['abs.twimg.com', 'moreCSSBundles'],
        regex: '{&quot;id&quot;:(?P<uid>\d+),&quot;id_str&quot;:&quot;\d+&quot;,&quot;name&quot;:&quot;(?P<username>.*?)&quot;,&quot;screen_name&quot;:&quot;(?P<name>.*?)&quot;',
    },
    // https://shadowban.eu/.api/user
    // https://gist.github.com/superboum/ab31bc4c85c731b9e89ebda5eaed9a3a
    'Twitter Shadowban': {
        flags: ['"timestamp"', '"profile": {', 'has_tweets'],
        regex: '^({.+?})$',
        extract_json: true,
        fields: {
            has_tweets: (x: any) => x.profile?.has_tweets,
            username: (x: any) => x.profile?.screen_name,
            is_exists: (x: any) => x.profile?.exists,
            is_suspended: (x: any) => x.profile?.suspended,
            is_protected: (x: any) => x.profile?.protected,
            has_ban: (x: any) => x.tests?.ghost?.ban,
            has_banned_in_search_suggestions: (x: any) => x.tests?.typeahead ? !x.tests.typeahead : null,
            has_search_ban: (x: any) => x.tests?.search ? !x.tests.search : null,
            has_never_replies: (x: any) => x.tests?.more_replies?.tweet ? !x.tests.more_replies.tweet : null,
            is_deboosted: (x: any) => x.tests?.more_replies?.ban ? x.tests.more_replies.ban : null,
        }
    },
    'Twitter GraphQL API': {
        flags: ['{"data":{"', 'user":{"id":'],
        regex: '^{"data":{"user":({.+})}}$',
        extract_json: true,
        url_mutations: [
            {
                from: 'https?://(www.)?twitter.com/(?P<username>[^/]+).*',
                to: 'https://twitter.com/i/api/graphql/ZRnOhhXPwue_JGILb9TNug/UserByScreenName?variables=%7B%22screen_name%22%3A%22{username}%22%2C%22withHighlightedLabel%22%3Atrue%7D',
            }
        ],
        fields: {
            uid: (x: any) => x?.id,
            fullname: (x: any) => x?.legacy?.name,
            bio: (x: any) => x?.legacy?.description,
            created_at: (x: any) => new Date(x?.legacy?.created_at || ''),
            image: (x: any) => x?.legacy?.profile_image_url_https?.replace('_normal', '') || '',
            image_bg: (x: any) => x?.legacy?.profile_banner_url,
            is_protected: (x: any) => x?.legacy?.protected,
            follower_count: (x: any) => x?.legacy?.followers_count,
            following_count: (x: any) => x?.legacy?.friends_count,
            location: (x: any) => x?.legacy?.location,
            favourites_count: (x: any) => x?.legacy?.favourites_count,
            links: (x: any) => (x?.legacy?.entities?.url?.urls || []).map((y: any) => y?.expanded_url),
        }
    },
    'Facebook user profile': {
        flags: ['<html id="facebook"', '<title>Facebook</title>'],
        regex: '({"__bbox":{"complete".+"sequence_number":0}})',
        extract_json: true,
        transforms: [
            JSON.parse,
            (x: any) => x.result.data.user,
            JSON.stringify,
        ],
        fields: {
            uid: (x: any) => x?.id,
            username: (x: any) => x?.url?.split('/')?.[x?.url?.split('/')?.length - 1],
            fullname: (x: any) => x?.name,
            is_verified: (x: any) => x?.is_verified,
            image: (x: any) => x?.profile_picture_for_sticky_bar?.uri || '',
            image_bg: (x: any) => x?.cover_photo?.photo?.image?.uri || '',
        }
    },
    'Facebook group': {
        flags: ['com.facebook.katana', 'XPagesProfileHomeController'],
        regex: '{"imp_id":".+?","ef_page":.+?,"uri":".+?\/(?P<username>[^\/]+?)","entity_id":"(?P<uid>\d+)"}',
    },
    'GitHub HTML': {
        flags: ['github.githubassets.com'],
        regex: 'data-hydro-click.+?profile_user_id&quot;:(?P<uid>\d+).+?originating_url&quot;:&quot;https:\/\/github\.com\/(?P<username>[^&]+)'
    },
    // https://api.github.com/users/torvalds
    'GitHub API': {
        flags: ['gists_url', 'received_events_url'],
        regex: '^({[\S\s]+?})$',
        extract_json: true,
        fields: {
            uid: (x: any) => x?.id,
            image: (x: any) => x?.avatar_url,
            created_at: (x: any) => x?.created_at,
            location: (x: any) => x?.location,
            follower_count: (x: any) => x?.followers,
            following_count: (x: any) => x?.following,
            fullname: (x: any) => x?.name,
            public_gists_count: (x: any) => x?.public_gists,
            public_repos_count: (x: any) => x?.public_repos,
            twitter_username: (x: any) => x?.twitter_username,
            is_looking_for_job: (x: any) => x?.hireable,
            gravatar_id: (x: any) => x?.gravatar_id,
            bio: (x: any) => (x?.bio || '').trim() || null,
            is_company: (x: any) => x?.company,
            blog_url: (x: any) => x?.blog,
        }
    },
    'Gitlab API': {
        flags: ['avatar_url', 'https://gitlab.com'],
        regex: '^\[({[\S\s]+?})\]$',
        extract_json: true,
        url_mutations: [
            {
                from: 'https://gitlab.com/(?P<username>.+)/?',
                to: 'https://gitlab.com/api/v4/users?username={username}',
            }
        ],
        fields: {
            uid: (x: any) => x?.id,
            fullname: (x: any) => x?.name,
            username: (x: any) => x?.username,
            state: (x: any) => x?.state,
            image: (x: any) => x?.avatar_url,
        }
    },
    'Patreon': {
        flags: ['www.patreon.com/api', 'pledge_url'],
        regex: 'Object.assign\(window.patreon.bootstrap, ([\s\S]*)\);[\s\S]*Object.assign\(window.patreon.campaignFeatures, {}\);',
        extract_json: true,
        fields: {
            patreon_id: (x: any) => x.campaign.included[0]?.id,
            patreon_username: (x: any) => x.campaign.included[0]?.attributes?.vanity,
            fullname: (x: any) => x.campaign.included[0]?.attributes?.full_name,
            links: (x: any) => (x.campaign.included || []).filter((y: any) => y.attributes?.app_name).map((y: any) => y.attributes?.external_profile_url),
            image: (x: any) => x.campaign.data.attributes?.avatar_photo_url,
            image_bg: (x: any) => x.campaign.data.attributes?.cover_photo_url,
            is_nsfw: (x: any) => x.campaign.data.attributes?.is_nsfw,
            created_at: (x: any) => x.campaign.data.attributes?.published_at,
            bio: (x: any) => x.campaign.data.attributes?.summary,
        }
    },
    'Flickr': {
        flags: ['api.flickr.com', 'photostream-models', 'person-profile-models'],
        regex: 'modelExport:(.*),[\s\S]*auth',
        extract_json: true,
        transforms: [
            (x: string) => x.replace('%20', ' '),
            (x: string) => x.replace('%2C', ','),
            JSON.parse,
            (x: any) => x.main,
            JSON.stringify,
        ],
        fields: {
            flickr_id: (x: any) => x.photostream_models[0]?.owner?.id,
            flickr_username: (x: any) => x.photostream_models[0]?.owner?.pathAlias,
            flickr_nickname: (x: any) => x.photostream_models[0]?.owner?.username,
            fullname: (x: any) => x.photostream_models[0]?.owner?.realname,
            location: (x: any) => x.person_profile_models[0]?.location,
            image: (x: any) => 'https:' + x.photostream_models[0]?.owner?.buddyicon?.retina,
            photo_count: (x: any) => x.person_profile_models[0]?.photoCount,
            follower_count: (x: any) => x.person_contacts_count_models[0]?.followerCount,
            following_count: (x: any) => x.person_contacts_count_models[0]?.followingCount,
            created_at: (x: any) => new Date(x.photostream_models[0]?.owner?.dateCreated || 0),
            is_pro: (x: any) => x.photostream_models[0]?.owner?.isPro,
            is_deleted: (x: any) => x.photostream_models[0]?.owner?.isDeleted,
            is_ad_free: (x: any) => x.photostream_models[0]?.owner?.isAdFree,
        }
    },
    'Yandex Disk file': {
        flags: ["project:'disk-public',page:'icon'", '@yandexdisk', 'yastatic.net'],
        regex: '"users":{.*?"uid":"(?P<yandex_uid>\d+)","displayName":"(?P<name>.+?)"',
    },
    'Yandex Disk photoalbum': {
        flags: ["project:'disk-public',page:'album'"],
        regex: '"users":{.*?"uid":"(?P<yandex_uid>\d+)","displayName":"(?P<name>.+?)"',
    },
    'Yandex Music AJAX request': {
        flags: ['{"success":true,"verified'],
        regex: '^(.+)$',
        extract_json: true,
        url_mutations: [
            {
                from: 'https?://music.yandex.ru/users/(?P<username>[^/]+).*',
                to: 'https://music.yandex.ru/handlers/library.jsx?owner={username}',
                headers: {"Referer": "https://music.yandex.ru/users/test/playlists"},
            }
        ],
        fields: {
            yandex_uid: (x: any) => x.owner.uid,
            username: (x: any) => x.owner.login,
            name: (x: any) => x.owner.name,
            image: (x: any) => getYandexProfilePic(x.owner.avatarHash),
            links: (x: any) => (x.profiles || []).flatMap((links: any) => links.addresses),
            is_verified: (x: any) => x.verified,
            liked_albums: (x: any) => x.counts?.likedAlbums,
            liked_artists: (x: any) => x.counts?.likedArtists,
            has_tracks: (x: any) => x.hasTracks,
        }
    },
    'Yandex Q (Znatoki) user profile': {
        flags: ['Ya.Znatoki'],
        regex: 'id="restoreData" type="application/json">({.+?})</script>',
        extract_json: true,
        transforms: [
            html.unescape,
            JSON.parse,
            (x: any) => x.store.entities.user[x.store.page.userStats?.id || ''],
            JSON.stringify,
        ],
        fields: {
            yandex_znatoki_id: (x: any) => x.id,
            yandex_uid: (x: any) => x.uuid,
            bio: (x: any) => x.about,
            name: (x: any) => x.displayName,
            image: (x: any) => getYandexProfilePic(x.avatarId),
            is_org: (x: any) => x.authOrg,
            is_banned: (x: any) => x.banned,
            is_deleted: (x: any) => x.deleted,
            created_at: (x: any) => x.created,
            last_answer_at: (x: any) => x.lastAnswerTime,
            rating: (x: any) => x.rating,
            gender: (x: any) => x.sex,
            links: (x: any) => new Set([x.url, x.promoUrl, x.socialContactUrl]),
            verified_categories: (x: any) => x.verifiedIn,
            is_from_q: (x: any) => x.theqMerged,
            is_bad_or_shock: (x: any) => x.badOrShock,
            is_excluded_from_rating: (x: any) => x.excludeFromRating,
            teaser: (x: any) => x.teaser,
            facebook_username: (x: any) => x.socialFacebook,
            instagram_username: (x: any) => x.socialInstagram,
            telegram_username: (x: any) => x.socialTelegram,
            twitter_username: (x: any) => x.socialTwitter,
            vk_username: (x: any) => x.socialVkontakte,
            answers_count: (x: any) => x.stats?.answersCount,
            following_count: (x: any) => x.stats?.subscribersCount,
        }
    },
    // TODO: rework
    'Yandex Market user profile': {
        flags: ['MarketNode', '{"entity":"user"'],
        regex: '>{"widgets":{"@MarketNode/MyArticles/ArticlesGrid.+?"collections":({"publicUser":{"\d+".+?}}})}<',
        extract_json: true,
        transforms: [
            JSON.parse,
            (x: any) => Object.values(x.publicUser)[0],
            JSON.stringify,
        ],
        fields: {
            username: (x: any) => x.login,
            yandex_uid: (x: any) => x.uid,
            yandex_public_id: (x: any) => x.publicId,
            fullname: (x: any) => x.publicDisplayName,
            image: (x: any) => x.avatar.replace('//', 'https://').replace('retina-50', '200'),
            reviews_count: (x: any) => x.grades,
            is_deleted: (x: any) => x.isDeleted,
            is_hidden_name: (x: any) => x.isDisplayNameEmpty,
            is_verified: (x: any) => x.verified,
            linked_social: (x: any) => (x.social || []).map((a: any) => ({
                type: a.provider.name,
                uid: a.userid,
                username: a.username,
                profile_id: a.profile_id
            })),
            links: (x: any) => Array.from(new Set((x.social || []).flatMap((l: any) => l.addresses))),
        },
    },
    'Yandex Music API': {
        flags: ['invocationInfo', 'req-id"'],
        regex: '^(.+)$',
        extract_json: true,
        transforms: [
            JSON.parse,
            (x: any) => x.result || {},
            JSON.stringify,
        ],
        fields: {
            username: (x: any) => x.login,
            yandex_uid: (x: any) => x.uid,
            yandex_public_id: (x: any) => x.publicId,
            fullname: (x: any) => x.fullName,
            links: (x: any) => x.socialProfiles,
            is_verified: (x: any) => x.verified,
            has_tracks: (x: any) => x.statistics?.hasTracks,
            liked_users: (x: any) => x.statistics?.likedUsers,
            liked_by_users: (x: any) => x.statistics?.likedByUsers,
            liked_artists: (x: any) => x.statistics?.likedArtists,
            liked_albums: (x: any) => x.statistics?.likedAlbums,
            ugc_tracks_count: (x: any) => x.statistics?.ugcTracks,
            is_private_statistics: (x: any) => x.statistics === 'private',
            is_private_social_profiles: (x: any) => x.socialProfiles === 'private',
        }
    },
    'Yandex Realty offer': {
        flags: ['realty.yandex.ru/offer'],
        regex: '({"routing":{"currentRoute".+?});',
        extract_json: true,
        fields: {
            your_yuid: (x: any) => x.user.yuid,
            your_uid: (x: any) => x.user.uid,
            your_wallet_balance: (x: any) => x.user.walletInfo?.balance,
            your_emails: (x: any) => (x.user.emails || []).join(', '),
            your_name: (x: any) => x.user.displayName,
            your_username: (x: any) => x.user.defaultEmail,
            your_phone: (x: any) => x.user.defaultPhone,
            yandex_uid: (x: any) => x.offerCard.card.author.id,
            name: (x: any) => decodeYaStr(x.offerCard.card.author.profile.name)
        }
    },
    'Yandex Collections': {
        flags: ['<meta name="collections"', '/collections'],
        regex: '(?:id="restoreData">)(.+?)<\/script>',
        extract_json: true,
        transforms: [
            JSON.parse,
            (x: any) => x.entities.users[x.profileUser?.id || ''],
            JSON.stringify,
        ],
        fields: {
            id: (x: any) => x.id,
            yandex_public_id: (x: any) => x.public_id,
            fullname: (x: any) => x.display_name,
            image: (x: any) => getYandexProfilePic(x.default_avatar_id),
            gender: (x: any) => x.sex,
            description: (x: any) => x.description,
            phone_id: (x: any) => x.phone_id,
            company_info: (x: any) => x.company_info,
            likes: (x: any) => x.stats?.likes,
            cards: (x: any) => x.stats?.cards,
            boards: (x: any) => x.stats?.boards,
            // TODO: other stats
            is_passport: (x: any) => x.is_passport,
            is_restricted: (x: any) => x.is_restricted,
            is_forbid: (x: any) => x.is_forbid,
            is_verified: (x: any) => x.is_verified,
            is_km: (x: any) => x.is_km,
            is_business: (x: any) => x.is_business,
        }
    },
    'Yandex Collections API': {
        flags: ['default_avatar_id', 'collections', 'is_passport'],
        regex: '^(.+)$',
        extract_json: true,
        fields: {
            id: (x: any) => x.id,
            yandex_public_id: (x: any) => x.public_id,
            fullname: (x: any) => x.display_name,
            image: (x: any) => getYandexProfilePic(x.default_avatar_id),
            gender: (x: any) => x.sex,
            description: (x: any) => x.description,
            phone_id: (x: any) => x.phone_id,
            company_info: (x: any) => x.company_info,
            likes: (x: any) => x.stats?.likes,
            cards: (x: any) => x.stats?.cards,
            boards: (x: any) => x.stats?.boards,
            // TODO: other stats
            is_passport: (x: any) => x.is_passport,
            is_restricted: (x: any) => x.is_restricted,
            is_forbid: (x: any) => x.is_forbid,
            is_verified: (x: any) => x.is_verified,
            is_km: (x: any) => x.is_km,
            is_business: (x: any) => x.is_business,
        }
    },
    'Yandex Reviews user profile': {
        flags: ['isInternalYandexNet', 'ReviewFormContent'],
        regex: 'window.__PRELOADED_DATA = ({[\s\S]+?})\n\s+}catch',
        extract_json: true,
        transforms: [
            JSON.parse,
            (x: any) => x.pageData.initialState,
            JSON.stringify,
        ],
        fields: {
            yandex_public_id: (x: any) => x.pkUser?.publicId,
            fullname: (x: any) => decodeYaStr(x.pkUser?.name),
            image: (x: any) => getYandexProfilePic(x.pkUser?.pic),
            is_verified: (x: any) => x.pkUser?.verified,
            reviews_count: (x: any) => Object.keys(x.reviews?.all || {}).length,
            following_count: (x: any) => x.subscription?.subscribersCount,
            follower_count: (x: any) => x.subscription?.subscriptionsCount,
        },
    },
    'Yandex Zen user profile': {
        flags: ['https://zen.yandex.ru/user/', 'zen-lib'],
        regex: '\n\s+var data = ({"__[\s\S]+?});\n',
        extract_json: true,
        transforms: [
            JSON.parse,
            (x: any) => (Object.entries(x).find(([k]) => k === '__serverState') as any).channel.source,
            JSON.stringify,
        ],
        fields: {
            yandex_public_id: (x: any) => x.publicId,
            fullname: (x: any) => x.title,
            image: (x: any) => x.logo,
            bio: (x: any) => x.description,
            yandex_messenger_guid: (x: any) => x.messengerGuid,
            links: (x: any) => x.socialLinks,
            type: (x: any) => x.type,
            comments_count: (x: any) => x.userCommentsCount,
            status: (x: any) => x.socialProfileStatus,
            following_count: (x: any) => x.subscribers,
            follower_count: (x: any) => x.subscriptions,
        },
    },
    'Yandex messenger search API': {
        flags: ['messages', 'matches', 'users_and_chats'],
        regex: '^(.+)$',
        extract_json: true,
        transforms: [
            JSON.parse,
            (x: any) => x.data.users_and_chats.items,
            (x: any) => x.length === 1 ? x : x.filter((y: any) => y.matches?.nickname),
            (x: any) => x[0] || {},
            JSON.stringify,
        ],
        fields: {
            fullname: (x: any) => x.data.display_name,
            username: (x: any) => x.matches?.nickname?.[0] || null,
            yandex_messenger_guid: (x: any) => x.data.guid,
            registration_status: (x: any) => x.data.registration_status,
            image: (x: any) => getYandexProfilePic(x.data.avatar_id),
            yandex_phone_id: (x: any) => x.data.phone_id,
            yandex_uid: (x: any) => x.data.uid,
        },
    },
    'Yandex messenger profile API': {
        flags: ['guid', 'registration_status', 'contacts'],
        regex: '^(.+)$',
        extract_json: true,
        transforms: [
            JSON.parse,
            (x: any) => x.data.users[0],
            JSON.stringify,
        ],
        fields: {
            fullname: (x: any) => x.display_name,
            yandex_messenger_guid: (x: any) => x.guid,
            registration_status: (x: any) => x.registration_status,
            image: (x: any) => getYandexProfilePic(x.avatar_id),
            yandex_phone_id: (x: any) => x.phone_id,
        },
    },
    'Yandex Bugbounty user profile': {
        flags: ['yandex_bug_bounty_terms_conditions', 'user__pic'],
        regex: 'upics\.yandex\.net\/(?P<yandex_uid>\d+)[\s\S]+<span>(?P<firstname>.+?)<\/span>\s+<em>(?P<username>.+?)<\/em>([\s\S]+?class="link">(?P<email>.+?)<\/a>)?([\s\S]+?<a href="(?P<url>.+?)" target="_blank" class="link link_social">)?',
    },
    'Yandex O': {
        flags: ['<PLACEHOLDER>'], // NOT PRESENT
        regex: '<script type="application/json" id="initial-state" nonce=".+?">(.+?)<\/script>',
        extract_json: true,
        fields: {
            yandex_public_id: (x: any) => x.publicProfile.params.publicUserId,
            fullname: (x: any) => decodeYaStr(x.publicProfile.data.publicProfile.seller.name),
            image: (x: any) => x.publicProfile.data.publicProfile.seller.avatar.size_100x100,
            score: (x: any) => x.publicProfile.data.publicProfile.seller.userBadge.score,
        }
    },
    'VK user profile foaf page': {
        flags: ['<foaf:Person>', '<ya:publicAccess>'],
        bs: true,
        fields: {
            is_private: (x: any) => x.find('ya:publicaccess').contents[0] === 'allowed',
            state: (x: any) => x.find('ya:profilestate').contents[0],
            first_name: (x: any) => x.find('ya:firstname').contents[0],
            last_name: (x: any) => x.find('ya:secondname').contents[0],
            fullname: (x: any) => x.find('foaf:name').contents[0],
            gender: (x: any) => x.find('foaf:gender').contents[0],
            created_at: (x: any) => new Date(x.find('ya:created').get('dc:date')),
            updated_at: (x: any) => new Date(x.find('ya:modified').get('dc:date')),
            // 'following_count': lambda x: x.find('ya:subscribedToCount'),
            // 'follower_count': lambda x: x.find('ya:friendsCount'),
            // 'friends_count': lambda x: x.find('ya:subscribersCount'),
            // 'image': lambda x: x.find('foaf:Image'),
            website: (x: any) => x.find('foaf:homepage').contents[0],
            // 'links': lambda x: x.find('foaf:externalProfile'),
        },
    },
    'VK user profile': {
        flags: ['<span class="ui_tab_content_new">', '"ownerId":'],
        url_mutations: [
            {
                from: 'https?://.*?vk.com/id(?P<vk_id>\d+)',
                to: 'https://vk.com/foaf.php?id={vk_id}',
            }
        ],
        regex: '"ownerId":(?P<vk_id>\d+),"wall".*?"loc":"(?P<vk_username>.*?)","back":"(?P<fullname>.*?)"'
    },
    'VK closed user profile': {
        flags: ['error_msg":"This profile is private', 'first_name_nom', 'last_name_gen'],
        regex: '<title>(?P<fullname>.*?)<\/title>'
    },
    'VK blocked user profile': {
        flags: ['window.vk = {', 'User was deleted or banned'],
        regex: '<title>(?P<fullname>.*?)<\/title>'
    },
    'Gravatar': {
        flags: ['gravatar.com\\/avatar', 'thumbnailUrl'],
        url_mutations: [
            {
                from: 'https?://.*?gravatar.com/(?P<username>[^/]+)',
                to: 'https://en.gravatar.com/{username}.json',
            }
        ],
        regex: '^(.+?)$',
        extract_json: true,
        fields: {
            gravatar_id: (x: any) => x.entry[0]?.id,
            image: (x: any) => x.entry[0]?.thumbnailUrl,
            username: (x: any) => x.entry[0]?.preferredUsername,
            fullname: (x: any) => x.entry[0]?.name?.formatted,
            name: (x: any) => x.entry[0]?.displayName,
            location: (x: any) => x.entry[0]?.currentLocation,
            emails: (x: any) => (x.entry[0]?.emails || []).map((y: any) => y.value),
            links: (x: any) => [
                ...((x.entry[0]?.accounts || []).map((y: any) => y.url)),
                ...((x.entry[0]?.urls || []).map((y: any) => y.value))
            ],
            bio: (x: any) => x.entry[0]?.aboutMe,
        }
    },
    'Instagram': {
        flags: ['instagram://user?username'],
        regex: '<script type="application/json" .*?>(.*?)</script>',
        extract_json: true,
        transforms: [
            JSON.parse,
            (x: any) => x.entry_data.ProfilePage[0].graphql.user,
            JSON.stringify,
        ],
        fields: {
            username: (x: any) => x.username,
            fullname: (x: any) => x.full_name,
            id: (x: any) => x.id,
            image: (x: any) => x.profile_pic_url_hd,
            bio: (x: any) => x.biography,
            business_email: (x: any) => x.business_email,
            external_url: (x: any) => x.external_url,
            facebook_uid: (x: any) => x.fbid,
            is_business: (x: any) => x.is_business_account,
            is_joined_recently: (x: any) => x.is_joined_recently,
            is_private: (x: any) => x.is_private,
            is_verified: (x: any) => x.is_verified,
            follower_count: (x: any) => x.edge_followed_by?.count,
            following_count: (x: any) => x.edge_follow?.count,
        }
    },
    'Instagram API': {
        flags: ['{"user":{"pk"', 'profile_pic_url'],
        regex: '^(.+?)$',
        extract_json: true,
        fields: {
            username: (x: any) => x.user?.username,
            id: (x: any) => x.user?.pk,
            image: (x: any) => x.user?.profile_pic_url,
        }
    },
    'Instagram page JSON': {
        flags: ['"logging_page_id":"profilePage', 'profile_pic_url'],
        regex: '^(.+?)$',
        extract_json: true,
        transforms: [
            JSON.parse,
            (x: any) => x.graphql.user,
            JSON.stringify,
        ],
        fields: {
            username: (x: any) => x.username,
            fullname: (x: any) => x.full_name,
            id: (x: any) => x.id,
            image: (x: any) => x.profile_pic_url_hd,
            bio: (x: any) => x.biography,
            business_email: (x: any) => x.business_email,
            external_url: (x: any) => x.external_url,
            facebook_uid: (x: any) => x.fbid,
            is_business: (x: any) => x.is_business_account,
            is_joined_recently: (x: any) => x.is_joined_recently,
            is_private: (x: any) => x.is_private,
            is_verified: (x: any) => x.is_verified,
            follower_count: (x: any) => x.edge_followed_by?.count,
            following_count: (x: any) => x.edge_follow?.count,
        }
    },
    'Spotify API': {
        flags: ['"uri": "spotify:user:'],
        regex: '^({[\S\s]+?})$',
        extract_json: true,
        fields: {
            username: (x: any) => x.name,
            follower_count: (x: any) => x.followers_count,
            following_count: (x: any) => x.following_count,
            image: (x: any) => x.image_url || '',
        }
    },
    'EyeEm': {
        flags: ['window.__APOLLO_STATE__', 'cdn.eyeem.com/thumb'],
        regex: '__APOLLO_STATE__ = ({.+?});\n',
        extract_json: true,
        transforms: [
            JSON.parse,
            (x: any) => Object.entries(x).filter(([k]) => k.startsWith('User:'))[0][1],
            JSON.stringify,
        ],
        fields: {
            eyeem_id: (x: any) => x.id,
            eyeem_username: (x: any) => x.nickname,
            fullname: (x: any) => x.fullname,
            bio: (x: any) => x.description,
            follower_count: (x: any) => x.totalFollowers,
            friends_count: (x: any) => x.totalFriends,
            liked_photos: (x: any) => x.totalLikedPhotos,
            photos: (x: any) => x.totalPhotos,
            facebook_uid: (x: any) => extractFacebookUid(x.thumbUrl)
        }
    },
    'Medium': {
        flags: ['https://medium.com', 'com.medium.reader'],
        regex: '__APOLLO_STATE__ = ({.+})',
        extract_json: true,
        transforms: [
            JSON.parse,
            (x: any) => Object.values(x).filter((k: any) => k.startsWith('User:'))[0],
            JSON.stringify,
        ],
        fields: {
            medium_id: (x: any) => x.id,
            medium_username: (x: any) => x.username,
            fullname: (x: any) => x.name,
            bio: (x: any) => x.bio,
            twitter_username: (x: any) => x.twitterScreenName,
            is_suspended: (x: any) => x.isSuspended,
            facebook_uid: (x: any) => x.facebookAccountId,
            is_blocking: (x: any) => x.isBlocking,
            is_muting: (x: any) => x.isMuting,
            post_counts: (x: any) => x.userPostCounts,
            follower_count: (x: any) => x.socialStats?.followerCount,
            following_count: (x: any) => x.socialStats?.followingCount,
        }
    },
    'Odnoklassniki': {
        flags: ['OK.startupData'],
        regex: 'path:"/(profile/)?(?P<ok_user_name_id>.+?)",state:".+?friendId=(?P<ok_id>\d+?)"',
    },
    'Habrahabr HTML (old)': {
        flags: ['habracdn.net'],
        bs: true,
        fields: {
            uid: (x: any) => x.find('div', { className: 'user-info__stats' }).parent.attrs.className[-1].split('_')[-1],
            username: (x: any) => x.find('a', { className: 'media-obj__image' }).get('href').split('/')[-2],
            image: (x: any) => 'http:' + x.find('div', { className: 'user-info__stats' }).find('img').get('src'),
        },
    },
    'Habrahabr JSON': {
        flags: ['habrastorage.org'],
        regex: '({"authorRefs":{.+?}),"viewport',
        extract_json: true,
        transforms: [
            JSON.parse,
            (x: any) => Object.values(x.authorRefs)[0],
            JSON.stringify,
        ],
        fields: {
            username: (x: any) => x.alias,
            about: (x: any) => x.speciality,
            birthday: (x: any) => x.birthday,
            gender: (x: any) => x.gender,
            rating: (x: any) => x.rating,
            karma: (x: any) => x.scoreStats.score,
            fullname: (x: any) => x.fullname,
            is_readonly: (x: any) => x.isReadonly,
            location: (x: any) => x.location,
            image: (x: any) => x.avatarUrl,
            follower_count: (x: any) => x.legacy?.followStats?.followStats,
            following_count: (x: any) => x.legacy?.followStats?.followersCount,
        }
    },
    'My Mail.ru': {
        flags: ['my.mail.ru', 'models/user/journal">'],
        regex: 'journal">\s+({\s+"name":[\s\S]+?})',
        extract_json: true,
        fields: {
            mail_uid: (x: any) => getMymailUid(x?.dir?.split('/')?.[x?.dir?.split('/')?.length - 2] || ''),
            mail_id: (x: any) => x?.id,
            username: (x: any) => x?.dir?.split('/')?.[x?.dir?.split('/')?.length - 2] || '',
            au_id: (x: any) => x?.auId,
            email: (x: any) => x?.email,
            name: (x: any) => x?.name,
            is_vip: (x: any) => x?.isVip,
            is_community: (x: any) => x?.isCommunity,
            is_video_channel: (x: any) => x?.isVideoChannel,
            image: (x: any) => 'https://filin.mail.ru/pic?email=' + x?.email,
        }
    },
    'Behance': {
        flags: ['behance.net', 'beconfig-store_state'],
        regex: '<script type="application/json" id="beconfig-store_state">({.+?})</script>',
        extract_json: true,
        transforms: [
            JSON.parse,
            (x: any) => x.profile.owner,
            JSON.stringify,
        ],
        url_mutations: [
            {
                from: 'https?://(www.)?behance.net/(?P<username>[^/]+).*',
                to: 'https://www.behance.net/{username}/appreciated',
                headers: {'Cookie': 'ilo0=true'},
            }
        ],
        fields: {
            uid: (x: any) => x.id,
            fullname: (x: any) => x.display_name,
            last_name: (x: any) => x.last_name,
            first_name: (x: any) => x.first_name,
            website: (x: any) => x.website,
            username: (x: any) => x.username,
            is_verified: (x: any) => x.verified === 1,
            teams: (x: any) => x.teams,
            bio: (x: any) => x.about[0]?.value,
            image: (x: any) => x.images?.['276'],
            image_bg: (x: any) => x.banner_image_url,
            company: (x: any) => x.company,
            city: (x: any) => x.city,
            country: (x: any) => x.country,
            location: (x: any) => x.location,
            created_at: (x: any) => new Date(x.created_on),
            occupation: (x: any) => x.occupation,
            links: (x: any) => (x.social_links || []).map((a: any) => a.url),
            twitter_username: (x: any) => x.twitter?.replace('@', ''),
            comments: (x: any) => x.stats.comments,
            followers_count: (x: any) => x.stats.followers,
            following_count: (x: any) => x.stats.following,
            profile_views: (x: any) => x.stats.received_profile_views,
            projects_count: (x: any) => x.stats.projects,
        }
    },
    'Disqus API': {
        flags: ['https://disqus.com/api/users/'],
        regex: '^([\s\S]+)$',
        url_mutations: [
            {
                from: 'https?://disqus.com/by/(?P<username>[^/]+)/?',
                to: 'https://disqus.com/api/3.0/users/details?user=username:{username}&attach=userFlaggedUser&api_key=E8Uh5l5fHZ6gD8U3KycjAIAk46f68Zw7C6eW8WSjZvCLXebZ7p0r1yrYDrLilk2F',
            }
        ],
        extract_json: true,
        transforms: [
            JSON.parse,
            (x: any) => x.response,
            JSON.stringify,
        ],
        fields: {
            id: (x: any) => x.id,
            fullname: (x: any) => x.name,
            disqus_username: (x: any) => x.username,
            bio: (x: any) => x.about,
            reputation: (x: any) => x.reputation,
            reputation_label: (x: any) => x.reputationLabel,
            following_count: (x: any) => x.numFollowers,
            follower_count: (x: any) => x.numFollowing,
            location: (x: any) => x.location,
            is_power_contributor: (x: any) => x.isPowerContributor,
            is_anonymous: (x: any) => x.isAnonymous,
            created_at: (x: any) => x.joinedAt,
            upvotes_count: (x: any) => x.numLikesReceived,
            website: (x: any) => x.url,
            forums_count: (x: any) => x.numForumsFollowing,
            image: (x: any) => x.avatar.large.permalink,
            is_trackers_disabled: (x: any) => x.response,
            forums_following_count: (x: any) => x.numForumsFollowing,
            is_private: (x: any) => x.isPrivate,
            comments_count: (x: any) => x.numPosts,
        }
    },
    'uCoz-like profile page': {
        flags: ['UCOZ-JS-DATA'],
        bs: true,
        fields: {
            fullname: (x: any) => x.find('div', { string: 'Имя:' }).next_sibling.split('[')[0].trim(),
            url: (x: any) => getUcozUserlink(x.find('div', { string: 'Пользователь:' })),
            image: (x: any) => getUcozImage(x),
            gender: (x: any) => x.find('div', { string: 'Имя:' }).next_sibling.split(' ')[-2],
            created_at: (x: any) => x.find('div', { string: 'Дата регистрации:' }).next_sibling.trim(),
            last_seen_at: (x: any) => x.find('div', { string: 'Дата входа:' }).next_sibling.trim(),
            link: (x: any) => getUcozUidNode(x).parent.get('href'),
            uidme_uguid: (x: any) => getUcozUidNode(x).parent.get('href', '').split('/')?.[getUcozUidNode(x).parent.get('href', '').split('/').length - 1],
            location: (x: any) => x.find('div', { string: 'Место проживания:' }).next_sibling.trim(),
            country: (x: any) => x.find('div', { string: 'Страна:' }).next_sibling.trim(),
            city: (x: any) => x.find('div', { string: 'Город:' }).next_sibling.trim(),
            state: (x: any) => x.find('div', { string: 'Штат:' }).next_sibling.trim(),
            email: (x: any) => getUcozEmail(x.find('div', { string: 'E-mail:' }).next_sibling.trim()),
            birthday_at: (x: any) => x.find('div', { string: 'Дата рождения:' }).next_sibling.split('[')[0].trim(),
        },
    },
    'uID.me': {
        flags: [' - uID.me</title>'],
        bs: true,
        fields: {
            username: (x: any) => x.find('title').contents[0].split(' ')[0],
            image: (x: any) => 'https://uid.me' + x.find('img', { id: 'profile_picture' }).get('src'),
            headline: (x: any) => x.find('h2', { id: 'profile_headline' }).contents[0].trim(),
            bio: (x: any) => x.find('div', { id: 'profile_bio' }).contents[0].trim(),
            contacts: (x: any) => x.find('div', { id: 'profile_contacts' }).find_all('a').map((a: any) => a.contents[0]),
            email: (x: any) => x.find('a', { id: 'user-email' }).contents[0],
            phone: (x: any) => x.find('span', { id: 'profile-phone' }).contents[0],
            skype: (x: any) => x.find('span', { id: 'profile-skype' }).contents[0],
            location: (x: any) => (x.find('ul', { id: 'profile_places' }).find_all('a').map((a: any) => a.contents[0])).join(', '),
            links: (x: any) => x.find('div', { id: 'list_my-sites' }).find_all('a').map((a: any) => a.get('href')) || null,
        },
    },
    'tapd': {
        flags: ['{"_id"', 'userDetails":{"', '"sid":"'],
        regex: '^([\s\S]+)$',
        extract_json: true,
        url_mutations: [
            {
                from: 'https?://tapd.co/(?P<username>[^/]+).*',
                to: 'https://tapd.co/api/user/getPublicProfile/{username}',
            }
        ],
        fields: {
            fullname: (x: any) => x.name,
            username: (x: any) => x.userDetails.username,
            bio: (x: any) => x.bio,
            views_count: (x: any) => x.count,
            image: (x: any) => 'https://distro.tapd.co/' + x.header.picture,
            links: (x: any) => (x.links || []).map((l: any) => l.url.trim()),
        }
    },
    'freelancer.com': {
        flags: ['{"status":"success","result":{"users":{'],
        regex: '^([\s\S]+)$',
        extract_json: true,
        url_mutations: [
            {
                from: 'https?://(www.)?freelancer\.com/u/(?P<username>[^/]+).*',
                to: 'https://www.freelancer.com/api/users/0.1/users?usernames%5B%5D={username}&compact=true',
            }
        ],
        transforms: [
            JSON.parse,
            (x: any) => Object.values(x.result.users)[0],
            JSON.stringify,
        ],
        fields: {
            id: (x: any) => x.id,
            nickname: (x: any) => x.display_name,
            username: (x: any) => x.username,
            fullname: (x: any) => x.public_name,
            company: (x: any) => x.company,
            company_founder_id: (x: any) => x.corporate?.founder_id,
            role: (x: any) => x.role,
            location: (x: any) => x.location.city + ', ' + x.location.country.name,
            created_at: (x: any) => new Date(x.registration_date),
        }
    },
    'Yelp': {
        flags: ['yelp.www.init.user_details'],
        bs: true,
        fields: {
            yelp_userid: (x: any) => x.find('meta', { property: 'og:url' }).get('content').split('=')[-1],
            fullname: (x: any) => x.find('h2', { className: 'css-rlqqlq' }).text,
            location: (x: any) => x.find('p', { className: 'css-147vps' }).text,
            image: (x: any) => x.find('img', { className: 'css-1pz4y59' }).get('src'),
        }
    },
    'Trello API': {
        flags: ['"aaId"', '"trophies":'],
        regex: '^([\s\S]+)$',
        extract_json: true,
        fields: {
            id: (x: any) => x.id,
            username: (x: any) => x.username,
            fullname: (x: any) => x.fullName,
            email: (x: any) => x.email,
            image: (x: any) => x.avatarUrl + '/170.png',
            bio: (x: any) => x.bio,
            type: (x: any) => x.memberType,
            gravatar_email_md5_hash: (x: any) => x.gravatarHash,
            is_verified: (x: any) => x.confirmed,
        }
    },
    // TODO
    'Weibo': {
        flags: ['$CONFIG = {"showAriaEntrance'],
        regex: 'aria-label',
        transforms: [
            (x: string) => x.split('\r\n'),
            (x: string[]) => x.filter(r => r).map(r => r.split("'")),
            (x: string[][]) => Object.fromEntries(x.map(r => [r[1], r[-2]])),
        ],
        fields: {
            weibo_id: (x: any) => x.oid,
            fullname: (x: any) => x.onick,
            nickname: (x: any) => x.nick,
            image: (x: any) => x.avatar_large,
            gender: (x: any) => x.sex,
            language: (x: any) => x.lang,
        }
    },
    'ICQ': {
        flags: ['a href="//icq.com/app" class="icq-prompt__banner-link"'],
        bs: true,
        fields: {
            fullname: (x: any) => x.find('h2', { className: 'icq-profile__name' }).contents[0],
            username: (x: any) => x.find('p', { className: 'icq-profile__subtitle' }).contents[0].trim().replace('\n\t@', ''),
            bio: (x: any) => x.find('p', { className: 'icq-profile__description box' }).contents[0].trim().replace('\n\t', ''),
            image: (x: any) => x.find('meta', { itemprop: 'image' }).get("content"),
        }
    },
    'Pastebin': {
        flags: ['src="/themes/pastebin/js/'],
        bs: true,
        fields: {
            image: (x: any) => 'https://pastebin.com' + x.find('div', { className: 'user-icon' }).find('img').get('src'),
            website: (x: any) => x.find('a', { className: 'web' }).get('href'),
            location: (x: any) => x.find('span', { className: 'location' }).contents[0],
            views_count: (x: any) => x.find('span', { className: 'views' }).contents[0].replace(',', ''),
            all_views_count: (x: any) => x.find('span', { className: 'views -all' }).contents[0].replace(',', ''),
            created_at: (x: any) => x.find('span', { className: 'date-text' }).get("title"),
        }
    },
    'Periscope': {
        flags: ['canonicalPeriscopeUrl', 'pscp://user/', 'property="og:site_name" content="Periscope"/>'],
        regex: 'data-store="(.*)"><div id="PageView"',
        extract_json: true,
        transforms: [
            (x: string) => x.replace('&quot;', '"'),
            JSON.parse,
            (x: any) => (Object.values(x.UserCache.users) as any)[0]?.user,
            JSON.stringify,
        ],
        fields: {
            id: (x: any) => x.id,
            created_at: (x: any) => x.created_at,
            periscope_username: (x: any) => x.username,
            fullname: (x: any) => x.display_name,
            bio: (x: any) => x.description,
            follower_count: (x: any) => x.n_followers,
            following_count: (x: any) => x.n_following,
            hearts_count: (x: any) => x.n_hearts,
            is_beta_user: (x: any) => x.is_beta_user,
            is_employee: (x: any) => x.is_employee,
            isVerified: (x: any) => x.isVerified,
            is_twitter_verified: (x: any) => x.is_twitter_verified,
            twitterUserId: (x: any) => x.twitterUserId,
            twitter_screen_name: (x: any) => x.twitter_screen_name,
            image: (x: any) => x.profile_image_urls[0]?.url,
        }
    },
    'Imgur API': {
        flags: ['"reputation_count"', '"reputation_name"'],
        regex: '^([\s\S]+)$',
        extract_json: true,
        url_mutations: [
            {
                from: 'https?://imgur.com/user/(?P<username>[^/]+)',
                to: 'https://api.imgur.com/account/v1/accounts/{username}?client_id=546c25a59c58ad7',
            }
        ],
        fields: {
            id: (x: any) => x.id,
            imgur_username: (x: any) => x.username,
            bio: (x: any) => x.bio,
            reputation_count: (x: any) => x.reputation_count,
            reputation_name: (x: any) => x.reputation_name,
            image: (x: any) => x.avatar_url,
            created_at: (x: any) => x.created_at,
        }
    },
    'PayPal': {
        flags: ["indexOf('qa.paypal.com')", 'PayPalSansSmall-Regular'],
        regex: 'application/json" id="client-data">(.*)</script><script type="application/json" id="l10n-content">',
        extract_json: true,
        transforms: [
            JSON.parse,
            (x: any) => x.recipientSlugDetails.slugDetails,
            JSON.stringify,
        ],
        fields: {
            fullname: (x: any) => x.userInfo.displayName,
            alternative_fullname: (x: any) => x.userInfo.alternateFullName,
            username: (x: any) => x.paypalmeSlugName,
            payerId: (x: any) => x.payerId,
            address: (x: any) => x.userInfo.displayAddress,
            isProfileStatusActive: (x: any) => x.isProfileStatusActive,
            primaryCurrencyCode: (x: any) => x.userInfo.primaryCurrencyCode,
            image: (x: any) => x.userInfo.profilePhotoUrl,
        }
    },
    'Tinder': {
        flags: ['<html id="Tinder"', 'content="tinder:'],
        regex: 'window.__data=(.*);</script><script>window.__intlData=JSON.parse',
        extract_json: true,
        transforms: [
            JSON.parse,
            (x: any) => x.webProfile,
            JSON.stringify,
        ],
        fields: {
            tinder_username: (x: any) => x.username,
            birth_date: (x: any) => x.user.birth_date,
            id: (x: any) => x.user._id,
            badges_list: (x: any) => x.user.badges.map((badge: any) => badge.type),
            company: (x: any) => x.user.jobs[0]?.company?.name,
            position_held: (x: any) => x.user.jobs[0]?.title?.name,
            fullname: (x: any) => x.user.name,
            image: (x: any) => x.user.photos[0]?.url,
            images: (x: any) => x.user.photos.map((photo: any) => photo.url),
            education: (x: any) => x.user.schools.map((school: any) => school.name),
        }
    },
    'ifunny.co': {
        flags: ["gtag('config', 'G-5FQ9GH4QMZ');"],
        regex: 'window.__INITIAL_STATE__=(.+?);',
        extract_json: true,
        transforms: [
            JSON.parse,
            (x: any) => x.user.data,
            JSON.stringify,
        ],
        fields: {
            id: (x: any) => x.id,
            username: (x: any) => x.nick,
            bio: (x: any) => x.about,
            image: (x: any) => x.avatar.url,
            follower_count: (x: any) => x.num.subscriptions,
            following_count: (x: any) => x.num.subscribers,
            post_count: (x: any) => x.num.total_posts,
            created_count: (x: any) => x.num.created,
            featured_count: (x: any) => x.num.featured,
            smile_count: (x: any) => x.num.total_smiles,
            achievement_count: (x: any) => x.num.achievements,
            is_verified: (x: any) => x.isVerified,
        }
    },
    'Wattpad API': {
        flags: ['{"username":"'],
        regex: '^({"username":"(.+)})$',
        extract_json: true,
        url_mutations: [
            {
                from: 'https?://(www.|a.)?wattpad.com/user/(?P<username>[^/]+).*',
                to: 'https://www.wattpad.com/api/v3/users/{username}',
            }
        ],
        fields: {
            username: (x: any) => x.username,
            image: (x: any) => x.avatar,
            image_bg: (x: any) => x.backgroundUrl,
            fullname: (x: any) => x.name,
            description: (x: any) => x.description,
            status: (x: any) => x.status,
            gender: (x: any) => x.gender,
            locale: (x: any) => x.locale,
            created_at: (x: any) => x.createDate,
            updated_at: (x: any) => x.modifyDate,
            location: (x: any) => x.location,
            isPrivate: (x: any) => x.isPrivate,
            verified: (x: any) => x.verified,
            verified_email: (x: any) => x.verified_email,
            ambassador: (x: any) => x.ambassador,
            isMuted: (x: any) => x.isMuted,
            allowCrawler: (x: any) => x.allowCrawler,
            follower_count: (x: any) => x.numFollowers,
            following_count: (x: any) => x.numFollowing,
            facebook: (x: any) => x.facebook ? 'https://www.facebook.com/' + x.facebook : null,
            twitter: (x: any) => x.twitter ? 'https://twitter.com/' + x.twitter : null,
            website: (x: any) => x.website,
            lulu: (x: any) => x.lulu,
            smashwords: (x: any) => x.smashwords,
            bubok: (x: any) => x.bubok,
        }
    },
    'Kik': {
        flags: ['{"firstName":"'],
        regex: '^({[\S\s]+?})$',
        extract_json: true,
        url_mutations: [
            {
                from: 'https?://kik.me/(?P<username>[^/]+).*',
                to: 'https://ws2.kik.com/user/{username}',
            }
        ],
        fields: {
            fullname: (x: any) => x.firstName + ' ' + x.lastName,
            image: (x: any) => x.displayPic,
            update_pic_at: (x: any) => new Date(x.displayPicLastModified),
        }
    },
    'Docker Hub API': {
        flags: ['{"id":"', '"type":"User"}'],
        regex: '^({[\S\s]+?})$',
        extract_json: true,
        url_mutations: [
            {
                from: 'https?://hub.docker.com/u/(?P<username>[^/]+).*',
                to: 'https://hub.docker.com/v2/users/{username}/',
            }
        ],
        fields: {
            uid: (x: any) => x.id,
            username: (x: any) => x.username,
            full_name: (x: any) => x.full_name,
            location: (x: any) => x.location,
            company: (x: any) => x.company,
            created_at: (x: any) => x.data_joined,
            type: (x: any) => x.type,
            image: (x: any) => x.gravatar_url,
        }
    },
    'Mixcloud API': {
        flags: ['"key": "'],
        regex: '^({[\S\s]+?})$',
        extract_json: true,
        url_mutations: [
            {
                from: 'https?://(www.)?mixcloud.com/(?P<username>[^/]+).*',
                to: 'https://api.mixcloud.com/{username}/',
            }
        ],
        fields: {
            fullname: (x: any) => x.fullname,
            username: (x: any) => x.username,
            country: (x: any) => x.country,
            city: (x: any) => x.city,
            created_at: (x: any) => x.created_time,
            updated_at: (x: any) => x.updated_time,
            description: (x: any) => x.blog,
            image: (x: any) => x.pictures?.['640wx640h'],
            follower_count: (x: any) => x.follower_count,
            following_count: (x: any) => x.following_count,
            cloudcast_count: (x: any) => x.cloudcast_count,
            favorite_count: (x: any) => x.favorite_count,
            listen_count: (x: any) => x.listen_count,
            is_pro: (x: any) => x.is_pro,
            is_premium: (x: any) => x.is_premium,
        }
    },
    'binarysearch API': {
        flags: [',"preferredSubmissionPrivacy":'],
        regex: '^({[\S\s]+?})$',
        extract_json: true,
        url_mutations: [
            {
                from: 'https?://binarysearch.com/@/(?P<username>[^/]+).*',
                to: 'https://binarysearch.com/api/users/{username}/profile',
            }
        ],
        fields: {
            uid: (x: any) => x.user?.id,
            username: (x: any) => x.user?.username,
            image: (x: any) => x.user?.profilePic,
            location: (x: any) => x.user?.location,
            created_at: (x: any) => new Date(x.user?.createTime),
            updated_at: (x: any) => new Date(x.user?.updateTime),
            bio: (x: any) => x.user?.bio,
            work: (x: any) => x.user?.work,
            college: (x: any) => x.user?.college,
            Role: (x: any) => x.user?.preferredRole,
            github_url: (x: any) => x.user?.githubHandle,
            twitter_url: (x: any) => x.user?.twitterHandle,
            linkedin_url: (x: any) => x.user?.linkedinHandle,
            links: (x: any) => x.user?.personalWebsite,
            isAdmin: (x: any) => x.user?.isAdmin,
            isVerified: (x: any) => x.user?.isVerified,
            HistoryPublic: (x: any) => x.user?.preferredHistoryPublic,
            RoomPublic: (x: any) => x.user?.preferredRoomPublic,
            InviteOnly: (x: any) => x.user?.preferredInviteOnly,
        }
    },
    'pr0gramm API': {
        flags: [',"likesArePublic":'],
        regex: '^({[\S\s]+?})$',
        extract_json: true,
        url_mutations: [
            {
                from: 'https?://pr0gramm.com/user/(?P<username>[^/]+).*',
                to: 'https://pr0gramm.com/api/profile/info?name={username}',
            }
        ],
        fields: {
            uid: (x: any) => x.user?.id,
            username: (x: any) => x.user?.name,
            created_at: (x: any) => new Date(x.user?.registered),
            uploadCount: (x: any) => x.uploadCount,
            commentCount: (x: any) => x.commentCount,
            tagCount: (x: any) => x.tagCount,
            likesArePublic: (x: any) => x.likesArePublic,
        }
    },
    'Aparat API': {
        flags: ['ProfileMore', 'aparat.com'],
        regex: '^({[\S\s]+?})$',
        extract_json: true,
        url_mutations: [
            {
                from: 'https?://(www.)?aparat.com/(?P<username>[^/]+)$',
                to: 'https://www.aparat.com/api/fa/v1/user/user/information/username/{username}',
            }
        ],
        fields: {
            uid: (x: any) => x.data.id,
            hashed_user_id: (x: any) => x.data.attributes.hash_user_id,
            username: (x: any) => x.data.attributes.username,
            fullname: (x: any) => x.data.attributes.name,
            image: (x: any) => x.data.attributes.pic_b,
            image_bg: (x: any) => x.data.attributes.cover_src,
            follower_count: (x: any) => x.data.attributes.follower_cnt,
            following_count: (x: any) => x.data.attributes.follow_cnt,
            is_official: (x: any) => x.data.attributes.official,
            is_banned: (x: any) => x.data.attributes.banned !== "no",
            links: (x: any) => [x.data.attributes.url, ...x.included[0]?.attributes.social.map((i: any) => i.link)],
            video_count: (x: any) => x.data.attributes.video_cnt,
            bio: (x: any) => x.data.attributes.description,
            created_at: (x: any) => new Date(x.data.attributes.start_date),
        }
    },
    'UnstoppableDomains': {
        flags: ['reservedForUserId', 'DomainProduct'],
        regex: '^({[\S\s]+?})$',
        extract_json: true,
        fields: {
            username: (x: any) => x.searchQuery,
            registered_domains: (x: any) => x.exact.filter((i: any) => i.status === "registered").map((i: any) => i.productCode),
            protected_domains: (x: any) => x.exact.filter((i: any) => i.status === "protected").map((i: any) => i.productCode),
        }
    },
    'memory.lol': {
        flags: ['{"accounts":[{'],
        regex: '^({[\S\s]+?})$',
        extract_json: true,
        fields: {
            id: (x: any) => x.accounts[0]?.id,
            known_usernames: (x: any) => x.accounts[0]?.screen_names || [],
        }
    }
};