module.exports = `
<div id="chat-page" xmlns:v-on="http://www.w3.org/1999/xhtml">
    <div class="groups-container">
        <div class="groups-list">
            <group-item v-for="(group, index) in groups" :group="group"
                        :active="selectedGroupId === group.staticId"
                        :to="{params: {groupId: group.staticId}}"
            ></group-item>

            <md-button class="md-primary add-group-button" @click="addFriend"><md-icon>add</md-icon> Add friend</md-button>
        </div>
        
        <div class="chat-control">
            <md-button class="md-primary md-icon-button" :disabled="true"><md-icon>settings</md-icon></md-button>
            <md-button class="md-primary md-icon-button" @click="addFriend"><md-icon>add</md-icon></md-button>
        </div>
    </div>
    <div class="chat-container">
        
        <md-progress-bar v-if="messagesLoading" class="md-accent" md-mode="indeterminate"></md-progress-bar>

        <div class="welcome" v-if="selectedGroupId === null">
            <div class="welcome-message">
                <div class="welcome-icon"><md-icon>help</md-icon></div>
                <div class="welcome-text">
                    You can create personal chats by adding friends or public chats.
                </div>
            </div>
        </div>
        
        <div class="chat" v-if="selectedGroupId !== null">
            <message-item v-for="message in messages" v-if="message" :message="message"></message-item>
        </div>
        
        <div class="new-message" v-if="selectedGroupId !== null">
            <div class="attachment"><md-button class="md-icon-button" @click="chooseAttachments"><md-icon class="fas fa-paperclip"></md-icon></md-button></div>
            
            <div class="emoji"><md-button class="md-icon-button"><md-icon class="far fa-smile"></md-icon></md-button></div>
            
            <div class="input">
                <textarea type="text" v-model="newMessage.text" placeholder="Write a message..." v-on:keyup.enter="onEnter"></textarea>
            </div>
            
            <div class="send" v-if="newMessage.text">
                <md-button class="md-icon-button" @click="sendMessage"><md-icon class="fas fa-paper-plane"></md-icon></md-button>
            </div>
        </div>
        <div>
            <div v-for="(id, index) in newMessage.contentsDbIds" class="contents-list">
                <content-manifest-info-item :db-id="id" @close="deleteContent(index)" :mini="true"></content-manifest-info-item>
            </div>
        </div>
    </div>
</div>
`;