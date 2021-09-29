module.exports = `
<div id="content-page" class="container-page">
    <div class="content-input md-layout">
        <div class="md-layout-item md-size-70">
            <md-field>
                <label>{{ humanReadableType }} manifest IPFS, IPNS or IPLD</label>
                <md-input v-model="inputManifestId" v-on:keyup="setManifestIdRoute()"></md-input>
            </md-field>
        </div>
        <div class="md-layout-item md-size-30" style="padding-left: 15px;">
            <md-field>
                <label>Type</label>
                <md-select v-model="type">
                    <md-option value="content">Content</md-option>
                    <md-option value="group">Group</md-option>
                    <md-option value="post">Post</md-option>
                </md-select>
            </md-field>
        </div>
    </div>
    <div class="content-container">
        <h3>{{ humanReadableType }} view</h3>
        <div v-if="loading">
            <md-progress-bar class="md-accent" md-mode="indeterminate"></md-progress-bar>
        </div>
        <div v-else>
            <div v-if="manifest">
                <post-item v-if="type === 'post'" :value="manifest"></post-item>

                <content-manifest-info-item v-if="type === 'content'" :manifest="manifest"
                                            :full-mode="true"></content-manifest-info-item>

                <div class="md-layout" v-if="type === 'group'">
                    <div class="md-layout-item md-size-30">
                        <group-item :group="manifest"></group-item>
                    </div>
                    <div class="md-layout-item md-size-70">
                        <post-item v-for="(post, index) in subManifests" v-model="subManifests[index]"
                                   v-if="subManifests[index]"></post-item>
                    </div>
                </div>

                <ipld-view v-if="type === 'unknown'" :ipld="manifest"></ipld-view>
            </div>
            <div v-else-if="manifestId">
                <div class="content-input md-layout">
                    <div class="md-layout-item md-size-50">
                        <md-field>
                            <label>Type</label>
                            <md-select v-model="contentType">
                                <md-option value="image">Image</md-option>
                                <md-option value="video">Video</md-option>
                                <md-option value="audio">Audio</md-option>
                                <md-option value="file">File</md-option>
                                <md-option value="text">Text</md-option>
                            </md-select>
                        </md-field>
                    </div>
                    <div class="md-layout-item md-size-50" style="padding-left: 15px;">
                        <md-field>
                            <label>Extension</label>
                            <md-input v-model="contentExtension"></md-input>
                        </md-field>
                    </div>
                </div>
                <content-manifest-item :storage-id="manifestId" :full-mode="true" :type="contentType" :extension="contentExtension"></content-manifest-item>
            </div>
            <div v-else-if="!loading">Please input {{ humanReadableType }} id to view</div>
        </div>
    </div>
</div>
`;