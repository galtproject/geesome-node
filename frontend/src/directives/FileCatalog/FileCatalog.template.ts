module.exports = `
<div class="file-catalog">
  <div class="md-layout">
    <div class="md-layout-item md-size-80">

      <div class="file-catalog-breadcrumbs">
        <span><a href @click.prevent="openFolder({parentItemId: null})">Home</a> > </span>
        <span v-for="breadcrumb in breadcrumbs"><a href @click.prevent="openFolder({id: breadcrumb.id})">{{breadcrumb.name}}</a> > </span>
      </div>

      <div class="file-catalog-header md-subhead">
        <span>Folders</span>
        <a class="link-with-icon ignore-subhead" href @click.prevent="addFolder()">
          <md-icon :class="{'fas': true, 'fa-caret-up': !showNewFolder, 'fa-caret-down': showNewFolder}"></md-icon>
          Add folder
        </a>
      </div>

      <md-card class="file-catalog-new-folder" v-if="showNewFolder">
        <md-card-content>
          <md-field>
            <label>New folder name</label>
            <md-input v-model="newFolder.name"></md-input>
          </md-field>

          <md-button class="md-raised md-accent" @click="saveFolder()" :disabled="!newFolder.name">Create</md-button>
        </md-card-content>
      </md-card>

      <div class="file-catalog-folders md-layout" v-if="foldersList.length">
        <div class="md-layout-item md-size-25" v-for="folder in foldersList">
          <div class="folder-item">
            <div v-if="selectMode" class="file-item-control">
              <div class="md-elevation-3 file-checkbox-container">
                <md-checkbox v-model="localSelectedIds" :value="folder.id"></md-checkbox>
              </div>
            </div>

            <div @click="openFolder(folder)" class="file-item-content">
              <div class="md-elevation-3 file-name-container">
                {{folder.name | prettyFileName}}
              </div>
            </div>

            <div v-if="!selectMode" class="file-item-control">
              <md-menu md-size="medium" :mdCloseOnClick="true">
                <md-button class="md-icon-button" md-menu-trigger>
                  <md-icon class="fas fa-ellipsis-v"></md-icon>
                </md-button>

                <md-menu-content class="custom-menu">
                  <md-menu-item>
                    <move-file-catalog-item-input placeholder="Move to ..." :item="folder"></move-file-catalog-item-input>
                  </md-menu-item>
                </md-menu-content>
              </md-menu>
            </div>
          </div>
        </div>
      </div>
      <div class="file-catalog-not-found" v-else>Folders not found</div>

      <pagination v-if="foldersTotal" :total="foldersTotal" :per-page="foldersPerPage"
                  :current-page.sync="foldersCurrentPage"
                  :display-pages="10"></pagination>

      <div class="file-catalog-header md-subhead">
        <span>Files</span>
        <a class="link-with-icon ignore-subhead" href @click.prevent="uploadFile()">
          <md-icon :class="{'fas': true, 'fa-caret-up': !showNewFile, 'fa-caret-down': showNewFile}"></md-icon>
          Upload file
        </a>
      </div>

      <md-card class="file-catalog-new-file" v-if="showNewFile">
        <md-card-content>
          <upload-content :folder-id="parentItemId" @uploaded="fileUploaded"
                          :hide-methods="hideMethods"></upload-content>
        </md-card-content>
      </md-card>

      <div class="file-catalog-files md-layout" v-if="filesList.length">
        <div class="md-layout-item md-size-25" v-for="file in filesList">
          <div class="file-item">
            <div v-if="selectMode" class="file-item-control">
              <div class="md-elevation-3 file-checkbox-container">
                <md-checkbox v-model="localSelectedIds" :value="file.id"></md-checkbox>
              </div>
            </div>

            <div @click="showFile(file)" class="file-item-content">
              <div class="md-elevation-3 file-name-container">
                {{file.name | prettyFileName}}
              </div>
              <div class="md-elevation-3 file-manifest-container">
                <span>Manifest:</span>
                <pretty-hex :hex="file.content.manifestStorageId"></pretty-hex>
              </div>
            </div>

            <div v-if="!selectMode" class="file-item-control">
              <md-menu md-size="medium" :mdCloseOnClick="true">
                <md-button class="md-icon-button" md-menu-trigger>
                  <md-icon class="fas fa-ellipsis-v"></md-icon>
                </md-button>

                <md-menu-content class="custom-menu">
                  <md-menu-item>
                    <move-file-catalog-item-input placeholder="Move to ..." :item="file"></move-file-catalog-item-input>
                  </md-menu-item>
                  <md-menu-item @click="deleteFile(file)"><span style="padding: 0 5px;">Delete</span></md-menu-item>
                </md-menu-content>
              </md-menu>
            </div>
          </div>
        </div>
      </div>
      <div class="file-catalog-not-found" v-else>Files not found</div>

      <pagination v-if="filesTotal" :total="filesTotal" :per-page="filesPerPage" :current-page.sync="filesCurrentPage"
                  :display-pages="10"></pagination>
    </div>
    <div class="md-layout-item md-size-20" v-if="currentFile">
      <content-manifest-info-item :db-id="currentFile.content.id" :vertical-mode="true"></content-manifest-info-item>
    </div>
  </div>
</div>
`;